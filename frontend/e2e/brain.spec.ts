import { expect, test } from '@playwright/test'

test.beforeEach(async({page})=>{
  await page.goto('/#desktop=e2e-desktop-bootstrap-only')
  await expect(page.getByTestId('neural-stage')).toBeVisible()
  await page.request.delete('/api/data',{headers:{'X-Jarvis-Confirm':'DELETE'}})
  await page.reload()
  await expect(page.getByTestId('neural-stage')).toHaveAttribute('data-memory-count','0')
})

test('o cérebro principal mostra a tarefa concluída, abre seu registro e mantém o zoom',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  await expect(page.locator('.intelligence-core')).toHaveCount(0)
  await expect(page.locator('.neural-canvas canvas')).toHaveCount(1)
  await page.getByRole('navigation').getByRole('button',{name:'Agenda e tarefas'}).click()
  await page.getByLabel('O que precisa ser feito?').fill('Finalizar o projeto de memória')
  await page.getByLabel('Prioridade').selectOption('alta')
  await page.getByRole('button',{name:'Adicionar',exact:true}).click()
  await page.getByRole('button',{name:'Concluir Finalizar o projeto de memória'}).click()
  await page.getByRole('button',{name:'Voltar ao núcleo'}).click()
  let id=''
  await expect.poll(async()=>{
    const graph=await page.request.get('/api/neural/graph').then(r=>r.json())
    id=graph.nodes.find((n:{kind:string;title:string})=>n.kind==='task'&&n.title==='Finalizar o projeto de memória')?.id||''
    return id
  }).not.toBe('')
  await expect(page.getByTestId('neural-stage')).toHaveAttribute('data-memory-ids',new RegExp(id))
  await page.getByRole('button',{name:'Explorar memórias',exact:true}).click()
  await page.getByTestId('memory-'+id).click()
  await expect(page.getByTestId('neural-stage')).toHaveAttribute('data-view','cluster')
  const before=parseFloat(await page.getByLabel('Zoom do cérebro').innerText())
  await page.getByRole('button',{name:'Aproximar cérebro',exact:true}).click()
  await expect.poll(async()=>parseFloat(await page.getByLabel('Zoom do cérebro').innerText())).toBeGreaterThan(before)
  await page.getByRole('button',{name:'Abrir memória Finalizar o projeto de memória',exact:true}).dblclick()
  await expect(page.getByRole('region',{name:'Leitor de memória'})).toContainText('Tarefa concluída: Finalizar o projeto de memória')
  await page.getByRole('button',{name:'Voltar ao agrupamento'}).click()
  await expect(page.getByTestId('neural-stage')).toHaveAttribute('data-view','cluster')
  await page.reload()
  await expect(page.getByTestId('neural-stage')).toHaveAttribute('data-memory-ids',new RegExp(id))
  const graph=await page.request.get('/api/neural/graph').then(r=>r.json())
  const ids=(await page.getByTestId('neural-stage').getAttribute('data-memory-ids'))!.split(',').sort()
  expect(ids).toEqual(graph.nodes.map((n:{id:string})=>n.id).sort())
  expect(errors).toEqual([])
})

test('captura de uma rede com registros persistidos reais e conexões do índice',async({page})=>{
  await page.setViewportSize({width:1536,height:1000})
  const themes=['História e civilizações romanas','Planejamento de estudos e aprendizagem','Arquitetura do projeto Jarvis','Astronomia e exploração espacial','Pesquisa sobre redes neurais','Saúde e rotina de exercícios','Música e composição criativa','Viagens e organização de roteiro']
  for(let batch=0;batch<12;batch++){
    const responses=await Promise.all(Array.from({length:10},(_,i)=>{
      const index=batch*10+i,theme=themes[index%themes.length]
      return page.request.post('/api/neural/nodes',{data:{kind:'note',title:`TESTE · ${theme} ${index+1}`,content:`Registro de teste persistido sobre ${theme}. Esta ideia reúne referências, objetivos e próximos passos para ${theme}. Item ${index+1}.`}})
    }))
    expect(responses.every(r=>r.status()===201)).toBe(true)
  }
  for(const title of ['Preparar apresentação','Organizar referências','Concluir leitura','Revisar projeto','Finalizar pesquisa']){
    const task=await page.request.post('/api/tasks',{data:{title:'TESTE · '+title}}).then(r=>r.json())
    expect((await page.request.patch(`/api/tasks/${task.id}`,{data:{done:true}})).status()).toBe(200)
  }
  const graph=await page.request.get('/api/neural/graph').then(r=>r.json())
  expect(graph.edges.length).toBeGreaterThan(0)
  await expect(page.getByTestId('neural-stage')).toHaveAttribute('data-memory-count',String(graph.nodes.length))
  await page.getByRole('button',{name:'Aproximar cérebro',exact:true}).click()
  await expect.poll(async()=>parseFloat(await page.getByLabel('Zoom do cérebro').innerText())).toBeGreaterThan(1.5)
  await expect.poll(async()=>parseInt(await page.getByLabel('FPS do cenário').innerText()),{timeout:12000}).toBeGreaterThanOrEqual(15)
  await page.screenshot({path:'test-results/brain-home.png',animations:'disabled'})
  await page.getByRole('button',{name:'Explorar memórias',exact:true}).click()
  await page.getByRole('button',{name:'Aproximar cérebro',exact:true}).click()
  await expect.poll(async()=>parseFloat(await page.getByLabel('Zoom do cérebro').innerText())).toBeGreaterThan(1.5)
  await expect.poll(async()=>parseInt(await page.getByLabel('FPS do cenário').innerText()),{timeout:12000}).toBeGreaterThanOrEqual(15)
  await page.screenshot({path:'test-results/brain-persisted.png',animations:'disabled'})
  const persisted=await page.request.get('/api/neural/graph').then(r=>r.json())
  expect(persisted.total).toBe(graph.total)
})
