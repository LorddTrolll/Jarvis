from fastapi.testclient import TestClient
from app.database import Task
from app.main import create_app


def task_nodes(client):
    return [node for node in client.get('/api/neural/graph').json()['nodes'] if node['kind'] == 'task']


def test_completion_creates_real_memory_once_and_recompletion_updates(client):
    task = client.post('/api/tasks', json={'title':'Concluir projeto cerebral','priority':'alta'}).json()
    assert task_nodes(client) == []
    before = client.get('/api/neural/graph').json()['revision']
    assert client.patch(f"/api/tasks/{task['id']}",json={'done':True}).status_code == 200
    node, = task_nodes(client)
    assert node['source_id'] == task['id'] and node['title'] == task['title']
    assert node['meta']['completed_at'].endswith('+00:00')
    assert client.get('/api/neural/graph').json()['revision'] > before
    assert 'Prioridade: alta' in client.get('/api/neural/nodes/'+node['id']).json()['content']
    client.patch(f"/api/tasks/{task['id']}",json={'done':True})
    assert len(task_nodes(client)) == 1
    client.patch(f"/api/tasks/{task['id']}",json={'done':False})
    assert task_nodes(client)[0]['id'] == node['id']  # Fotografia da conclusão anterior.
    client.patch(f"/api/tasks/{task['id']}",json={'done':True})
    assert task_nodes(client)[0]['id'] == node['id'] and len(task_nodes(client)) == 1


def test_completed_legacy_tasks_backfill_once_without_invented_completion_date(app):
    with app.state.sessions() as db:
        db.add(Task(title='Tarefa antiga já feita',done=True))
        db.commit()
    for _ in range(2):
        with TestClient(create_app(app.state.settings)) as restored:
            restored.post('/api/session',json={'password':'teste-seguro'})
            node, = task_nodes(restored)
            assert node['meta']['completed_at'] is None
            assert 'Data não registrada' in restored.get('/api/neural/nodes/'+node['id']).json()['content']


def test_deleting_memory_respects_suppression_and_keeps_agenda_record(app,client):
    task=client.post('/api/tasks',json={'title':'Memória removível'}).json()
    client.patch(f"/api/tasks/{task['id']}",json={'done':True})
    node,=task_nodes(client)
    assert client.delete('/api/neural/nodes/'+node['id']).status_code==200
    assert client.get('/api/tasks').json()[0]['done'] is True
    with TestClient(create_app(app.state.settings)) as restored:
        restored.post('/api/session',json={'password':'teste-seguro'})
        assert task_nodes(restored)==[]


def test_deleting_agenda_task_removes_only_its_memory(client):
    first=client.post('/api/tasks',json={'title':'Primeira atividade'}).json()
    second=client.post('/api/tasks',json={'title':'Segunda atividade'}).json()
    for task in [first,second]:
        client.patch(f"/api/tasks/{task['id']}",json={'done':True})
    assert len(task_nodes(client))==2
    client.delete(f"/api/tasks/{first['id']}")
    assert [n['source_id'] for n in task_nodes(client)]==[second['id']]
