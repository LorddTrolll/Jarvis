import { expect, test } from '@playwright/test'

test.beforeEach(async({page})=>{
  await page.goto('/#desktop=e2e-desktop-bootstrap-only')
  await expect(page.getByTestId('neural-stage')).toBeVisible()
  await page.request.delete('/api/data',{headers:{'X-Jarvis-Confirm':'DELETE'}})
  await page.getByRole('button',{name:'Central Pedagógica Jarvis',exact:true}).click()
  await expect(page.getByRole('heading',{name:'O que vamos preparar?'})).toBeVisible()
})

test('PDF próprio real, prévia, memória, histórico e fallback de compartilhamento',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  await page.getByLabel('Tema da aula').fill('Roma: anotações do professor')
  await page.getByText('Criar PDF a partir de um texto próprio',{exact:true}).click()
  await page.getByLabel('Texto próprio para PDF').fill('O Senado romano reunia membros da elite e passou por transformações ao longo dos séculos. Estas anotações são do professor e serão discutidas com a turma.')
  await page.getByRole('button',{name:'Preparar materiais',exact:true}).click()
  const region=page.getByRole('region',{name:'Material pedagógico'})
  await expect(region.getByText('PDFs prontos para revisão',{exact:true})).toBeVisible()
  await expect(region.locator('canvas')).toBeVisible()
  await expect.poll(()=>region.locator('canvas').evaluate(canvas=>{
    const el=canvas as HTMLCanvasElement,ctx=el.getContext('2d')!,pixels=ctx.getImageData(0,0,el.width,el.height).data
    let dark=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<180&&pixels[i+1]<180&&pixels[i+2]<180&&pixels[i+3]>0)dark++
    return dark
  })).toBeGreaterThan(300)
  const jobs=await page.request.get('/api/education/jobs').then(r=>r.json())
  expect(jobs[0].memory_id).toBeTruthy()
  const job=await page.request.get('/api/education/jobs/'+jobs[0].id).then(r=>r.json())
  expect((await page.request.get(job.files[0].url)).headers()['content-type']).toBe('application/pdf')
  await region.getByRole('button',{name:'Revisar e compartilhar',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'Revisar e compartilhar PDF'})
  await expect(dialog.getByRole('button',{name:'Preparar compartilhamento',exact:true})).toBeDisabled()
  await dialog.getByLabel('Mensagem do compartilhamento').fill('Minhas anotações de história para o grupo de ideias.')
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button',{name:'Preparar compartilhamento',exact:true}).click()
  await expect(dialog.getByText('Este navegador não compartilha arquivos pelo sistema.',{exact:false})).toBeVisible()
  const download=page.waitForEvent('download')
  await dialog.getByRole('button',{name:'Baixar PDF para anexar',exact:true}).click()
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/)
  await dialog.getByRole('button',{name:'Fechar diálogo'}).click()
  await page.getByRole('button',{name:'Histórico',exact:true}).click()
  await expect(page.locator('.education-history-row').getByText('Roma: anotações do professor',{exact:true})).toBeVisible()
  await page.screenshot({path:'test-results/education-history.png',animations:'disabled'})
  await page.reload()
  await expect(page.getByTestId('neural-stage')).toHaveAttribute('data-memory-ids',new RegExp(job.memory_id))
  expect(errors).toEqual([])
})

test('pesquisa sem chaves explica a configuração e nunca exibe vídeos fabricados',async({page})=>{
  await page.getByRole('navigation',{name:'Central Pedagógica'}).getByRole('button',{name:'Pesquisar',exact:true}).click()
  await page.getByLabel('Pesquisa pedagógica').fill('Formação e queda do Império Romano')
  await page.locator('.education-card form').getByRole('button',{name:'Pesquisar',exact:true}).click()
  await expect(page.getByText('YouTube sem credencial.',{exact:false})).toBeVisible()
  await expect(page.locator('.education-videos article')).toHaveCount(0)
  await expect(page.getByText('Nenhuma fonte disponível para esta consulta.',{exact:false})).toBeVisible()
})

test('compartilhador nativo recebe o PDF real após revisão e não confirma entrega',async({page})=>{
  await page.evaluate(()=>{
    Object.defineProperty(navigator,'canShare',{configurable:true,value:({files}:{files:File[]})=>files?.[0]?.type==='application/pdf'})
    Object.defineProperty(navigator,'share',{configurable:true,value:async({files,text}:{files:File[];text:string})=>{
      const raw=await files[0].slice(0,4).text()
      if(raw!=='%PDF'||!text)throw new Error('Arquivo de teste inválido')
      document.documentElement.dataset.testShared=files[0].name
    }})
  })
  const created=await page.request.post('/api/education/jobs',{data:{topic:'Material de teste nativo',content:'Texto original do professor para validar a passagem do arquivo ao compartilhador do sistema.'}}).then(r=>r.json())
  await expect.poll(()=>page.request.get('/api/education/jobs/'+created.id).then(r=>r.json()).then(j=>j.status)).toBe('completed')
  await page.getByRole('button',{name:'Histórico',exact:true}).click()
  await page.getByRole('button',{name:/^Material de teste nativo/}).click()
  await page.getByRole('button',{name:'Revisar e compartilhar',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'Revisar e compartilhar PDF'})
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button',{name:'Preparar compartilhamento',exact:true}).click()
  await dialog.getByRole('button',{name:'Escolher aplicativo e grupo',exact:true}).click()
  await expect(dialog.getByText('A entrega no WhatsApp não pode ser verificada',{exact:false})).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-test-shared',/\.pdf$/)
  const result=await page.request.get('/api/education/jobs/'+created.id).then(r=>r.json())
  expect(result.shares[0].state).toBe('system_returned')
})
