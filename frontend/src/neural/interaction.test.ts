import { describe, expect, it } from 'vitest'
import { NeuralGestureMachine, navigate } from './interaction'
import type { NeuralSample } from './interaction'

const sample = (ratio:number,target='arquivo'): NeuralSample => ({visible:true,active:true,ratio,point:{x:.5,y:.5},target})
describe('pinças neurais intencionais',()=>{
  it('retarda a pinça simples pela janela dupla, depois expande uma única vez',()=>{
    const machine=new NeuralGestureMachine()
    machine.sample(sample(.2),0);machine.sample(sample(.2),150)
    expect(machine.sample(sample(.6),200)).toEqual([])
    expect(machine.sample(sample(.7),500)).toEqual([])
    expect(machine.sample(sample(.7),700)).toMatchObject([{type:'single',target:'arquivo'}])
    expect(machine.sample(sample(.7),900)).toEqual([])
  })
  it('duas pinças abrem o mesmo arquivo sem disparar a expansão intermediária',()=>{
    const machine=new NeuralGestureMachine()
    machine.sample(sample(.2),0);machine.sample(sample(.2),120);machine.sample(sample(.6),180)
    machine.sample(sample(.2),300);machine.sample(sample(.2),430)
    expect(machine.sample(sample(.6),500)).toMatchObject([{type:'double',target:'arquivo'}])
    expect(machine.sample(sample(.7),1000)).toEqual([])
  })
  it('pinças em alvos diferentes nunca viram abertura dupla',()=>{
    const machine=new NeuralGestureMachine()
    machine.sample(sample(.2,'um'),0);machine.sample(sample(.6,'um'),150)
    machine.sample(sample(.2,'dois'),250)
    const actions=machine.sample(sample(.6,'dois'),400)
    expect(actions).toMatchObject([{type:'single',target:'um'}])
    expect(actions.some(a=>a.type==='double')).toBe(false)
  })
  it('soltar uma pinça comum não é pinça reversa, mesmo mantendo a mão aberta',()=>{
    const machine=new NeuralGestureMachine()
    machine.sample(sample(.2),0);machine.sample(sample(.2),130)
    const actions=[200,350,600,900,1300,1800,2300].flatMap(t=>machine.sample(sample(1.8),t))
    expect(actions.filter(a=>a.type==='single')).toHaveLength(1)
    expect(actions.some(a=>a.type==='reverse')).toBe(false)
  })
  it('exige nova posição neutra e abertura contínua para voltar',()=>{
    const machine=new NeuralGestureMachine()
    machine.sample(sample(.7),0);machine.sample(sample(.7),250);machine.sample(sample(.9),320)
    expect(machine.sample(sample(1.15),450)).toEqual([])
    expect(machine.sample(sample(1.6),620)).toMatchObject([{type:'reverse'}])
    expect(machine.sample(sample(1.8),1900)).toEqual([])
    expect(machine.sample(sample(1.8),3000)).toEqual([])
  })
  it('abertura que muda de direção não dispara retorno',()=>{
    const machine=new NeuralGestureMachine()
    machine.sample(sample(.7),0);machine.sample(sample(.7),250);machine.sample(sample(.9),300)
    machine.sample(sample(1.1),400);machine.sample(sample(.7),500)
    expect(machine.sample(sample(1.7),650)).toEqual([])
  })
  it('pinça sustentada orbita e sua soltura não abre um arquivo',()=>{
    const machine=new NeuralGestureMachine()
    machine.sample(sample(.2),0)
    expect(machine.sample({...sample(.2),point:{x:.6,y:.5}},650).map(a=>a.type)).toEqual(['drag_start','drag'])
    expect(machine.sample(sample(.7),800)).toMatchObject([{type:'drag_end'}])
    expect(machine.sample(sample(.7),1400)).toEqual([])
  })
  it('perda da mão ou pausa cancela seleções pendentes',()=>{
    const machine=new NeuralGestureMachine()
    machine.sample(sample(.2),0);machine.sample(sample(.7),150)
    machine.sample({...sample(.7),visible:false},250)
    expect(machine.sample(sample(.7),900)).toEqual([])
    machine.sample({...sample(.2),active:false},1000)
    expect(machine.sample(sample(.7),1200)).toEqual([])
  })
})
describe('histórico hierárquico',()=>{
  it('expande, abre e retorna ao agrupamento antes de retornar ao cérebro completo',()=>{
    const initial={level:'global',selected:null,parent:null} as const
    const cluster=navigate(initial,'expand','grupo')
    expect(cluster.level).toBe('cluster')
    const file=navigate(cluster,'open','arquivo')
    expect(file).toMatchObject({level:'file',selected:'arquivo',parent:'grupo'})
    const previous=navigate(file,'back')
    expect(previous).toMatchObject({level:'cluster',selected:'grupo'})
    expect(navigate(previous,'back')).toEqual(initial)
  })
  it('dupla direta na visão global também mantém um nível de agrupamento ao voltar',()=>{
    const file=navigate({level:'global',selected:null,parent:null},'open','arquivo')
    expect(navigate(file,'back')).toMatchObject({level:'cluster',selected:'arquivo'})
  })
  it('abrir uma memória relacionada mantém o agrupamento de origem',()=>{
    const next=navigate({level:'file',selected:'arquivo',parent:'grupo'},'open','relacionado')
    expect(navigate(next,'back')).toMatchObject({level:'cluster',selected:'grupo'})
  })
})
