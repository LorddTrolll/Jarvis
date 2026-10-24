"""Mede o índice em banco TEMPORÁRIO com memórias explicitamente sintéticas."""
import json
from pathlib import Path
import sys
import tempfile
import time

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / 'backend'))
from app.config import Settings
from app.database import initialize
from app.memory.models import MemoryNode
from app.memory.semantic import SemanticIndex
from app.memory.store import state, touch

subjects = ['Astronomia estrelas planetas galáxia universo', 'História Roma imperadores Antiguidade república',
            'Culinária receita farinha ovos chocolate', 'Biologia células proteínas genética organismo',
            'Música instrumentos melodia harmonia composição', 'Arquitetura concreto edifício planta estrutura',
            'Geografia montanhas rios oceano continentes', 'Fotografia lentes exposição imagem iluminação']
with tempfile.TemporaryDirectory(prefix='jarvis-neural-benchmark-') as folder:
    engine,sessions = initialize(Settings(_env_file=None,data_dir=folder,openai_key='',search_key='',telegram_token=''))
    with sessions() as db:
        state(db).initialized=True
        db.add_all([MemoryNode(id=f'benchmark-{i}',kind='note',title=f'TESTE SINTÉTICO {i}',
                              content=subjects[i%len(subjects)],origin=f'benchmark:{i}',meta='{"synthetic":true}') for i in range(1000)])
        touch(db);db.commit()
        index=SemanticIndex();start=time.perf_counter();index.ensure(db);build=time.perf_counter()-start
        start=time.perf_counter();hits=index.search(db,'imperadores de Roma');query=time.perf_counter()-start
        result={'synthetic_nodes':1000,'index_build_seconds':round(build,4),'warm_search_ms':round(query*1000,2),
                'result_count':len(hits),'method':'TF-IDF + LSA local','temporary_database':True}
        assert hits and any('Roma' in r['excerpt'] for r in hits)
        print(json.dumps(result,ensure_ascii=False,indent=2))
    engine.dispose()
