"""Registro de compartilhamento assistido; não envia mensagens nem presume entrega."""
import uuid
from fastapi import HTTPException
from .models import ShareEvent, TeachingFile


class WhatsAppShareService:
    transitions={'prepared':{'initiated','downloaded'},'initiated':{'system_returned','cancelled','failed'},
                 'cancelled':{'initiated','downloaded'},'failed':{'initiated','downloaded'},
                 'system_returned':{'initiated','downloaded'},'downloaded':{'initiated','downloaded'}}

    def prepare(self,db,job,body):
        file=db.get(TeachingFile,body.file_id)
        if job.status!='completed' or not file or file.job_id!=job.id:raise HTTPException(409,'Selecione um PDF concluído deste material.')
        if not job.memory_id:raise HTTPException(409,'Salve este material no cérebro antes de preparar o compartilhamento.')
        if not body.reviewed:raise HTTPException(400,'Revise o PDF e a mensagem antes de preparar o compartilhamento.')
        event=ShareEvent(id=str(uuid.uuid4()),job_id=job.id,file_id=file.id,state='prepared',message=body.message)
        db.add(event);db.commit()
        return {'id':event.id,'state':event.state,'file_url':f'/api/education/files/{file.id}',
                'message':event.message,'notice':'Escolha o WhatsApp e o grupo no compartilhador do seu dispositivo. O Jarvis não confirma entrega.'}

    def outcome(self,db,identifier,body):
        event=db.get(ShareEvent,identifier)
        if not event:raise HTTPException(404,'Preparação não encontrada.')
        if body.state not in self.transitions.get(event.state,set()):raise HTTPException(409,'Estado de compartilhamento incompatível.')
        event.state=body.state;db.commit()
        return {'state':event.state,'delivery_verified':False}
