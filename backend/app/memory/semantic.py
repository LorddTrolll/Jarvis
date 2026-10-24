"""Embeddings LSA locais. Não baixa modelos e nunca transmite conteúdo."""
import json
import re
import threading
import numpy as np
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize
from sqlalchemy import delete, select
from .models import MemoryEdge, MemoryNode
from .store import link, node_id, state

STOPWORDS = "a ao aos aquela aquele aqueles aqui as ate com como da das de dela dele deles depois do dos e ela ele eles em entre era essa esse esses esta estamos estar estas este estes eu foi foram ha isso isto ja lhe mais mas me mesmo meu minha muito na nas nao nem no nos nossa nosso num numa o os ou para pela pelas pelo pelos por porque qual quando que quem se sem seu seus sua suas sobre so tambem tem temos ter um uma umas uns voce voces foi ser sao assim ainda tudo quero jarvis tarefa crie abrir abra mostre informe esta disponivel configurado chave backend modelo pergunta perguntas resposta respostas documento documentos arquivo arquivos encontre encontrar busque buscar procure procurar pesquisa pesquisas memoria memorias conteudo minhas meus".split()


class SemanticIndex:
    def __init__(self):
        self.lock = threading.RLock()
        self.revision = -1
        self.ids = []
        self.vectorizer = None
        self.svd = None
        self.lexical = None
        self.vectors = None

    def ensure(self, db):
        with self.lock:
            revision = state(db).revision
            if revision == self.revision:
                return
            nodes = list(db.scalars(select(MemoryNode).where(MemoryNode.kind.not_in(["topic", "conversation"])).order_by(MemoryNode.id)))
            self.ids = [n.id for n in nodes]
            self.vectorizer = self.svd = self.lexical = self.vectors = None
            db.execute(delete(MemoryEdge).where(MemoryEdge.relation.in_(["similarity", "term"])))
            old_topics = list(db.scalars(select(MemoryNode).where(MemoryNode.kind == "topic")))
            new_topics = set()
            db.flush()
            if nodes:
                vectorizer = TfidfVectorizer(strip_accents="unicode", lowercase=True, stop_words=STOPWORDS,
                    max_features=4096, ngram_range=(1, 2), sublinear_tf=True, token_pattern=r"(?u)\b[^\W\d_]\w{2,}\b")
                try:
                    lexical = vectorizer.fit_transform([n.title + "\n" + n.content for n in nodes])
                except ValueError:
                    lexical = None
                if lexical is not None:
                    self.vectorizer, self.lexical = vectorizer, lexical
                    if min(lexical.shape) >= 4:
                        self.svd = TruncatedSVD(n_components=min(64, min(lexical.shape) - 1), random_state=42)
                        self.vectors = normalize(self.svd.fit_transform(lexical))
                    else:
                        self.vectors = normalize(lexical.toarray())
                    features = vectorizer.get_feature_names_out()
                    # Vizinhos em blocos, sem matriz densa N×N retida em memória.
                    for start in range(0, len(nodes), 128):
                        lex = (lexical[start:start + 128] @ lexical.T).toarray()
                        semantic = self.vectors[start:start + 128] @ self.vectors.T
                        for row, local in enumerate(range(start, min(start + 128, len(nodes)))):
                            candidates = np.argsort(-(0.6 * lex[row] + 0.4 * semantic[row]))[:6]
                            for other in candidates:
                                if other <= local or lex[row, other] < 0.12:
                                    continue
                                common = lexical[local].multiply(lexical[other])
                                ranked = sorted(zip(common.indices, common.data), key=lambda x: -x[1])[:3]
                                terms = [str(features[i]) for i, _ in ranked]
                                if not terms:
                                    continue
                                score = float(np.clip(.6 * lex[row, other] + .4 * semantic[row, other], 0, 1))
                                if score < .23:
                                    continue
                                link(db, nodes[local].id, nodes[other].id, "similarity",
                                     "Similaridade vetorial local; termos compartilhados: " + ", ".join(terms), round(score, 4))
                    for i, node in enumerate(nodes):
                        node.embedding = json.dumps(np.round(self.vectors[i], 6).tolist())
                    # Assuntos só existem quando um termo aparece em pelo menos duas memórias reais.
                    frequency = np.asarray((lexical > 0).sum(axis=0)).ravel()
                    ranked = [int(i) for i in np.argsort(-frequency) if frequency[i] >= 2 and len(str(features[i])) > 4][:24]
                    from .models import MemorySuppression
                    for feature in ranked:
                        term = str(features[feature]); identifier = node_id("topic:" + term)
                        if db.get(MemorySuppression, identifier):
                            continue
                        new_topics.add(identifier)
                        topic = db.get(MemoryNode, identifier)
                        if topic is None:
                            topic = MemoryNode(id=identifier, kind="topic", title=term, content="Assunto extraído dos conteúdos: " + term,
                                origin="topic:" + term, meta=json.dumps({"derived": True, "method": "termo compartilhado"}))
                            db.add(topic); db.flush()
                        members = lexical[:, feature].nonzero()[0]
                        for member in members:
                            link(db, identifier, nodes[int(member)].id, "term", f'O termo “{term}” aparece neste conteúdo.', float(lexical[member, feature]))
            for topic in old_topics:
                if topic.id not in new_topics:
                    explicit = db.scalar(select(MemoryEdge.id).where(
                        (MemoryEdge.source == topic.id) | (MemoryEdge.target == topic.id)).limit(1))
                    if not explicit:
                        db.delete(topic)
            db.commit()
            self.revision = revision

    def search(self, db, query, kind=None, after=None, before=None, limit=20):
        with self.lock:
            self.ensure(db)
            if self.vectorizer is None or not self.ids:
                return []
            lexical = self.vectorizer.transform([query])
            if not lexical.nnz:
                return []
            vector = normalize(self.svd.transform(lexical)) if self.svd else normalize(lexical.toarray())
            lex_scores = (lexical @ self.lexical.T).toarray()[0]
            semantic = (vector @ self.vectors.T)[0]
            coverage = (self.lexical[:, lexical.indices] > 0).sum(axis=1).A1 / max(1, lexical.nnz)
            scores = .45 * lex_scores + .35 * semantic + .2 * coverage
            result = []
            for i in np.argsort(-scores):
                if scores[i] < .14 or lex_scores[i] < .02:
                    continue
                node = db.get(MemoryNode, self.ids[int(i)])
                if node and json.loads(node.meta).get("navigation_command"):
                    continue
                if kind == "conversation" and node:
                    from .store import node_id
                    conversation = json.loads(node.meta).get("conversation_id")
                    node = db.get(MemoryNode, node_id("conversation:" + conversation)) if conversation else None
                if not node or kind and node.kind != kind or after and node.created_at < after or before and node.created_at > before:
                    continue
                if any(r["id"] == node.id for r in result):
                    continue
                terms = re.findall(r"\w{3,}", query.lower())
                positions = [node.content.lower().find(t) for t in terms if node.content.lower().find(t) >= 0]
                offset = max(0, min(positions) - 100) if positions else 0
                result.append({"id": node.id, "kind": node.kind, "title": node.title, "score": round(float(scores[i]), 4),
                               "excerpt": node.content[offset:offset + 500], "offset": offset,
                               "method": "TF-IDF + LSA local", "source_id": node.source_id,
                               "created_at": node.created_at.isoformat(), "meta": json.loads(node.meta)})
                if len(result) >= limit:
                    break
            return result
