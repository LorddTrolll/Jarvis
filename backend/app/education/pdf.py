"""PDFs reais, com fontes redistribuíveis e ilustrações vetoriais originais."""
import hashlib
import io
import random
import re
import unicodedata
import textwrap
from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape
from zoneinfo import ZoneInfo

import reportlab
from pypdf import PdfReader
from reportlab.graphics.shapes import Circle, Drawing, Ellipse, Line, Polygon, Rect, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle)

LABELS={'lesson_plan':'Plano de aula','sequence':'Sequência didática','summary':'Resumo ilustrado','slides':'Slides',
        'activities':'Atividades','assessment':'Avaliação','answer_key':'Gabarito separado','mind_map':'Mapa mental',
        'word_search':'Caça-palavras','adapted':'Material adaptado','coloring':'Desenho para colorir','text':'Texto'}


def slug(text):
    ascii_text=unicodedata.normalize('NFKD',text).encode('ascii','ignore').decode()
    return re.sub(r'[^a-z0-9]+','-',ascii_text.lower()).strip('-')[:90] or 'material'


def word_grid(words):
    words=list(dict.fromkeys(re.sub('[^A-Z]','',unicodedata.normalize('NFKD',w.upper()).encode('ascii','ignore').decode())[:18] for w in words))
    words=[w for w in words if len(w)>1][:15]
    size=max(15,max((len(w) for w in words),default=0))
    rng=random.Random('|'.join(words));grid=[[rng.choice('ABCDEFGHIJKLMNOPQRSTUVWXYZ') for _ in range(size)] for _ in range(size)]
    rows=rng.sample(range(size),len(words));positions=[]
    for word,row in zip(words,rows):
        col=rng.randrange(size-len(word)+1)
        grid[row][col:col+len(word)]=list(word)
        positions.append((word,row+1,col+1))
    return grid,positions


def illustration(kind,caption,coloring=False):
    d=Drawing(450,225)
    ink=colors.HexColor('#55418f') if not coloring else colors.black
    fill=colors.HexColor('#eee8fc') if not coloring else colors.white
    if kind=='temple':
        d.add(Rect(60,28,330,12,fillColor=fill,strokeColor=ink));d.add(Rect(80,40,290,12,fillColor=fill,strokeColor=ink))
        for x in range(100,351,50):
            d.add(Rect(x,52,22,102,fillColor=fill,strokeColor=ink));d.add(Rect(x-4,150,30,9,fillColor=fill,strokeColor=ink))
        d.add(Polygon([65,160,385,160,225,210],fillColor=fill,strokeColor=ink));d.add(Line(85,168,365,168,strokeColor=ink))
    elif kind=='plant':
        d.add(Line(225,35,225,175,strokeColor=ink,strokeWidth=4))
        for x,y,angle in [(183,90,-1),(268,128,1),(183,155,-1)]:
            d.add(Ellipse(x-38,y-15,x+38,y+15,fillColor=fill,strokeColor=ink))
            d.add(Line(225,y-8,x,y,strokeColor=ink))
        d.add(Line(225,35,190,12,strokeColor=ink));d.add(Line(225,35,260,12,strokeColor=ink))
    elif kind=='solar_system':
        d.add(Circle(225,112,24,fillColor=fill,strokeColor=ink))
        for radius in [55,85,115,145,175]:
            d.add(Ellipse(225-radius,112-radius*.5,225+radius,112+radius*.5,fillColor=None,strokeColor=ink,strokeWidth=.4))
        for x,y,radius in [(278,122,6),(153,136,9),(323,83,10),(93,153,13),(390,83,12)]:
            d.add(Circle(x,y,radius,fillColor=fill,strokeColor=ink))
    else:
        for x,y in [(80,65),(80,165),(370,65),(370,165)]:
            d.add(Line(225,112,x,y,strokeColor=ink));d.add(Circle(x,y,29,fillColor=fill,strokeColor=ink))
        d.add(Circle(225,112,46,fillColor=fill,strokeColor=ink))
    return d


def mind_map(plan):
    d=Drawing(450,360);ink=colors.HexColor('#71549f');fill=colors.HexColor('#f0e9fa')
    positions=[(72,315),(378,315),(72,235),(378,235),(72,125),(378,125),(72,45),(378,45)]
    for branch,(x,y) in zip(plan['mind_map'],positions):
        d.add(Line(225,180,x,y,strokeColor=ink,strokeWidth=1))
        d.add(Rect(x-63,y-24,126,48,rx=7,ry=7,fillColor=fill,strokeColor=ink))
        for i,line in enumerate(textwrap.wrap(branch['label'],19)[:3]):
            d.add(String(x,y+10-i*12,line,fontName='Jarvis',fontSize=9,textAnchor='middle',fillColor=colors.HexColor('#332342')))
    d.add(Rect(145,150,160,60,rx=10,ry=10,fillColor=colors.HexColor('#584078'),strokeColor=ink))
    for i,line in enumerate(textwrap.wrap(plan['title'],22)[:3]):
        d.add(String(225,192-i*15,line,fontName='JarvisBold',fontSize=10,textAnchor='middle',fillColor=colors.white))
    return d


class DocumentGenerationService:
    def __init__(self):
        fonts=Path(reportlab.__file__).parent/'fonts'
        for name,file in [('Jarvis','Vera.ttf'),('JarvisBold','VeraBd.ttf')]:
            if name not in pdfmetrics.getRegisteredFontNames():pdfmetrics.registerFont(TTFont(name,str(fonts/file)))
        pdfmetrics.registerFontFamily('Jarvis',normal='Jarvis',bold='JarvisBold',italic='Jarvis',boldItalic='JarvisBold')

    def render(self,request,plan,context,revision=1):
        kinds=list(dict.fromkeys(request['materials']))
        # O gabarito sempre fica em um arquivo próprio, inclusive para avaliações.
        if any(k in kinds for k in ['activities','assessment','word_search']) and 'answer_key' not in kinds:kinds.append('answer_key')
        return [self.document(kind,request,plan,context,revision) for kind in kinds]

    def document(self,kind,request,plan,context,revision):
        landscape=kind=='slides';pagesize=(960,540) if landscape else A4
        adapted=kind=='adapted';font_size=15 if adapted else 11
        styles=getSampleStyleSheet()
        styles.add(ParagraphStyle('JBody',fontName='Jarvis',fontSize=font_size,leading=font_size*1.6,spaceAfter=10,wordWrap='CJK'))
        styles.add(ParagraphStyle('JTitle',fontName='JarvisBold',fontSize=24 if landscape else 21,leading=28 if landscape else 31,spaceAfter=14 if landscape else 18,textColor=colors.HexColor('#473078')))
        styles.add(ParagraphStyle('JHeading',fontName='JarvisBold',fontSize=14,leading=21,spaceBefore=14,spaceAfter=9))
        styles.add(ParagraphStyle('JSmall',fontName='Jarvis',fontSize=9,leading=14,spaceAfter=7,wordWrap='CJK'))
        styles.add(ParagraphStyle('JSlide',fontName='Jarvis',fontSize=18,leading=24,spaceAfter=10))
        slide_style=request.get('slide_style','clean')
        if landscape and slide_style=='high_contrast':
            for name in ['JTitle','JBody','JHeading','JSmall','JSlide']:styles[name].textColor=colors.white
        buffer=io.BytesIO();story=[]
        def p(text,style='JBody'):
            return Paragraph(escape(str(text)).replace('\n','<br/>'),styles[style])
        def add(text,style='JBody'):story.append(p(text,style))
        def heading(text):add(text,'JHeading')
        def bullets(values):
            for value in values:add('• '+value)
        def references():
            sources=context.get('sources',[]);videos=context.get('videos',[])
            if not sources and not videos:
                add('Não houve fontes externas disponíveis. Conteúdo requer revisão docente.','JSmall');return
            heading('Fontes e vídeos para conferência')
            for index,source in enumerate(sources+videos,1):
                title=escape(source['title']);url=escape(source['url'],{'"':'&quot;'})
                story.append(Paragraph(f'{index}. {title}<br/><link href="{url}">{url}</link>',styles['JSmall']))
            add('Os links provêm das APIs consultadas. Trechos de pesquisa e metadados não certificam o conteúdo integral ou a adequação etária dos vídeos.','JSmall')
        title=plan['title'] if plan else request['topic']
        def start(label):
            add(label.upper(),'JSmall');add(title,'JTitle')
            add(f"{request.get('subject','')} · {request['grade']}º ano · Revisão {revision}",'JSmall')
        def graphic(coloring=False):
            story.append(illustration(plan['illustration'],plan['illustration_caption'],coloring))
            add(plan['illustration_caption']+' — ilustração esquemática original Jarvis.','JSmall')
        def activities():
            add('Nome: __________________________________  Turma: __________  Data: ____/____/______','JSmall')
            for activity in plan['activities']:
                block=[p(f"{activity['number']}. {activity['prompt']}")]
                for letter,option in zip('ABCD',activity['options']):block.append(p(f'{letter}) {option}'))
                if activity['kind']=='discursive':block.extend([Spacer(1,18),p('__________________________________________________________________','JSmall'),Spacer(1,18)])
                story.append(KeepTogether(block));story.append(Spacer(1,8))
        if kind=='slides':
            start('Apresentação');graphic();story.append(PageBreak())
            for index,slide in enumerate(plan['slides']):
                if index:story.append(PageBreak())
                add(slide['title'],'JTitle')
                for bullet in slide['bullets']:add('• '+bullet,'JSlide')
                add(f"{title} · {request['grade']}º ano",'JSmall')
            story.append(PageBreak());heading('Referências');references()
        else:
            start(LABELS[kind])
            if kind=='text':
                for paragraph in request['content'].split('\n\n'):add(paragraph)
            elif kind in ['lesson_plan','sequence']:
                add(plan['overview']);heading('Objetivos de aprendizagem');bullets(plan['objectives'])
                if plan['curriculum']:heading('Referências curriculares a conferir');bullets(plan['curriculum'])
                elif request.get('bncc'):add('BNCC: não foram encontrados códigos com evidência suficiente. O alinhamento curricular precisa ser conferido pelo docente.')
                for index,lesson in enumerate(plan['lessons'],1):
                    story.append(PageBreak());heading(f"Aula {index} · {lesson['title']} · {lesson['duration_minutes']} min")
                    add(lesson['explanation']);heading('Metodologia');bullets(lesson['methodology'])
                    heading('Recursos');bullets(lesson['resources']);heading('Avaliação');add(lesson['evaluation'])
                graphic();references()
            elif kind in ['activities','assessment']:activities()
            elif kind=='answer_key':
                add('USO DO PROFESSOR · Este arquivo contém as respostas e deve ser compartilhado separadamente.','JSmall')
                for activity in plan['activities']:
                    heading(f"Questão {activity['number']}");add(activity['answer']);add(activity['explanation'])
                if 'word_search' in request['materials']:
                    heading('Solução do caça-palavras · linha e coluna iniciais')
                    for word,row,col in word_grid(plan['word_search'])[1]:add(f'{word}: linha {row}, coluna {col}; leitura da esquerda para a direita.')
            elif kind=='word_search':
                add('Encontre as palavras na horizontal, da esquerda para a direita.');grid,positions=word_grid(plan['word_search'])
                table=Table(grid,colWidths=24,rowHeights=24)
                table.setStyle(TableStyle([('FONTNAME',(0,0),(-1,-1),'Jarvis'),('FONTSIZE',(0,0),(-1,-1),11),('ALIGN',(0,0),(-1,-1),'CENTER'),('GRID',(0,0),(-1,-1),.3,colors.HexColor('#dddddd'))]))
                story.append(table);story.append(Spacer(1,15));add('Palavras: '+', '.join(v[0] for v in positions))
            elif kind=='mind_map':
                story.append(mind_map(plan))
                for branch in plan['mind_map']:
                    story.append(KeepTogether([p('↳ '+branch['label'],'JHeading')]+[p('• '+item) for item in branch['items']]))
                graphic();references()
            elif kind=='coloring':
                add('Observe o esquema, pinte e escreva uma legenda relacionada ao tema.');graphic(True)
                add('Minha legenda: _____________________________________________________')
                add('___________________________________________________________________')
            elif kind=='adapted':
                add('Adaptações solicitadas: '+(request.get('adaptation') or 'Fonte ampliada, espaçamento maior e uma tarefa por bloco.'))
                # A simplificação conceitual é responsabilidade do planejamento; não afirmamos adaptação clínica.
                add(plan['overview']);heading('Vamos aprender');bullets(plan['objectives']);graphic()
                for activity in plan['activities']:
                    story.append(PageBreak());add(f"Atividade {activity['number']}",'JHeading');add(activity['prompt'])
                    for letter,option in zip('ABCD',activity['options']):add(f'{letter}) {option}')
                    story.append(Spacer(1,100))
            else:
                add(plan['overview']);graphic()
                for lesson in plan['lessons']:heading(lesson['title']);add(lesson['explanation'])
                references()
        school=request.get('school') or 'Material pedagógico · Jarvis'
        if request.get('term'):school+=' · '+request['term']
        teacher=request.get('teacher') or '________________________'
        date=datetime.now(ZoneInfo('America/Sao_Paulo')).strftime('%d/%m/%Y')
        def decorate(canvas,doc):
            canvas.saveState();canvas.setFont('Jarvis',8);canvas.setFillColor(colors.HexColor('#675d79'))
            width,height=pagesize
            if landscape and slide_style in ['visual','high_contrast']:
                canvas.setFillColor(colors.HexColor('#130b25') if slide_style=='high_contrast' else colors.HexColor('#f1ebfa'))
                canvas.rect(0,0,width,height,stroke=0,fill=1)
                canvas.setFillColor(colors.HexColor('#ded0f4') if slide_style=='high_contrast' else colors.HexColor('#675d79'))
            canvas.drawString(42,height-23,school[:100]);canvas.drawRightString(width-42,height-23,date)
            canvas.drawString(42,22,f'Professor(a): {teacher[:65]}');canvas.drawRightString(width-42,22,f'{LABELS[kind]} · {doc.page}')
            canvas.restoreState()
        doc=SimpleDocTemplate(buffer,pagesize=pagesize,rightMargin=42,leftMargin=42,topMargin=48,bottomMargin=42,
                              title=title+' — '+LABELS[kind],author='Jarvis · material para revisão docente')
        doc.build(story,onFirstPage=decorate,onLaterPages=decorate)
        data=buffer.getvalue();reader=PdfReader(io.BytesIO(data));texts=[page.extract_text() or '' for page in reader.pages]
        if not texts or len(texts)>200 or len(data)>10_000_000 or any(len(t.strip())<15 for t in texts):raise ValueError('O PDF não passou na validação de conteúdo e tamanho.')
        if kind in ['activities','assessment'] and len(plan['activities'])!=request['questions']:raise ValueError('Quantidade de atividades inconsistente.')
        return {'kind':kind,'name':f"{slug(request['topic'])}-{slug(LABELS[kind])}-r{revision}.pdf",'data':data,
                'sha256':hashlib.sha256(data).hexdigest(),'pages':len(texts),'text':'\n\n'.join(texts)}
