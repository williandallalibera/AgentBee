# AgentBee Software Design Document

## 1. Objetivo
Este documento define a fase atual do AgentBee: consolidar um frontend operacional e testavel antes da integracao progressiva com Supabase, Trigger.dev e servicos externos.

O foco imediato nao e ampliar funcionalidades. O foco e estabilizar a base visual, a navegacao e os estados de interface para que o produto possa ser validado manualmente em `local mode` e depois receber dados reais sem retrabalho estrutural.

O produto tambem deve estar preparado para operar multiplos canais de distribuicao social, com prioridade para Instagram e LinkedIn como canais editoriais do MVP expandido.

## 2. Escopo da Fase Atual
- consolidar um shell visual unico para todo o dashboard
- padronizar pages, cards, tabelas, formularios e telas de detalhe
- reduzir divergencias entre `local mode` e fluxo normal
- garantir responsividade basica em desktop e mobile
- manter a arquitetura preparada para Supabase, sem aprofundar a integracao nesta fase

Ficam fora desta fase:
- refinamento de regras de negocio complexas
- ampliacao do pipeline com novas automacoes
- fechamento de observabilidade completa
- integracao final e obrigatoria com todos os provedores externos

## 3. Direcao Visual Oficial
O AgentBee passa a adotar oficialmente um dashboard operacional inspirado no arquivo de Figma fornecido pelo usuario e adaptado ao contexto do produto.

Principios visuais obrigatorios:
- sidebar fixa escura com navegacao principal persistente
- topbar azul com acoes globais, busca e menu do usuario
- conteudo principal sobre fundo cinza claro
- widgets e secoes internas em blocos brancos
- linguagem visual densa, administrativa e orientada a operacao
- hierarquia clara entre KPIs, tabelas operacionais, filas e formularios

Tokens principais:
- primario: `#3c8dbc`
- sidebar: `#222d32`
- sidebar accent: `#1a2226`
- sucesso: `#00a65a`
- alerta: `#f39c12`
- erro: `#dd4b39`
- fundo de pagina: `#ecf0f5`

## 4. Shell da Aplicacao
O shell do dashboard e composto por:
- `sidebar` persistente em desktop e colapsavel em mobile
- `header` superior com busca, notificacoes e menu do usuario
- `main` com espacamento consistente e largura fluida

Arquivos canonicos do shell:
- `src/components/layout/app-sidebar.tsx`
- `src/components/layout/dashboard-frame.tsx`
- `src/components/layout/user-menu.tsx`
- `src/app/globals.css`

Regras do shell:
- navegacao em desktop nao deve sumir ao trocar de rota
- navegacao em mobile deve fechar apos selecao de item
- o shell define paddings, comportamento responsivo e densidade base
- paginas internas nao devem reinventar o layout global

## 5. Estrategia de Dados
O projeto opera em dois modos:

### 5.1 Local Mode
Usado para validacao visual e estrutural.

Caracteristicas:
- ignora autenticacao real quando apropriado
- consome mocks centralizados
- permite navegar pelo produto sem depender de Supabase
- e a principal superficie de QA desta fase

Arquivos principais:
- `src/lib/env.ts`
- `src/lib/local-mode.ts`
- `src/middleware.ts`

### 5.2 Modo Integrado
Usado para a proxima etapa.

Caracteristicas:
- usa Supabase para auth, queries e persistencia
- mantem a mesma estrutura visual do `local mode`
- deve trocar a origem dos dados, nao a composicao da interface

## 5.3 Canais e Integracoes
O sistema deve suportar, no minimo, os seguintes canais e provedores:
- `openai`
- `google_chat`
- `google_workspace`
- `instagram`
- `linkedin`

Regras:
- Instagram e LinkedIn devem existir como provedores configuraveis por workspace
- o frontend deve permitir preparar credenciais e metadados desses canais antes da integracao completa
- o pipeline e os dados devem ser estruturados para publicacao por canal, sem assumir apenas Instagram
- `local mode` deve expor Instagram e LinkedIn como integracoes visiveis para QA

## 5.4 Gestao de Usuarios
O sistema adota perfil unico de acesso:
- papel unico: `admin`
- cadastro basico: nome, email e senha
- alteracao direta de senha sem fluxo por email
- manipulacao de usuarios via interface interna em `settings/users`

Regra de seguranca:
- operacoes de criacao de usuario e troca de senha usam `SUPABASE_SERVICE_ROLE_KEY` apenas no servidor

## 6. Estrategia de Paginas
Cada pagina do dashboard deve seguir esta composicao:

1. cabecalho de pagina com titulo e descricao curta
2. bloco principal de acao ou resumo
3. secoes de suporte em cards, tabelas ou listas
4. estados vazios e mensagens de indisponibilidade

Paginas prioritarias de estabilizacao:
- `dashboard`
- `content`
- `content/[id]`
- `approvals/[taskId]/initial`
- `approvals/[taskId]/final`
- `integrations`
- `playbook`
- `team`
- `campaigns`
- `logs`

## 7. Padroes de Interface

### 7.1 Cards
- usar cards claros como containers primarios
- evitar mistura desnecessaria entre estilos manuais e tokens globais
- rodapes e cabecalhos precisam manter alinhamento previsivel

### 7.2 Tabelas e Listagens
- suportar overflow horizontal sem quebrar o shell
- evitar linhas impossiveis de ler em resolucoes medias
- acoes devem permanecer visiveis e compreensiveis

### 7.3 Formularios
- priorizar colunas simples e blocos compactos
- manter mensagens de ajuda e estados desabilitados claros
- formularios do `local mode` devem parecer reais, mesmo quando inativos

### 7.4 Telas de Detalhe
- blocos textuais longos devem usar `overflow-auto` com leitura confortavel
- links longos nao podem quebrar o layout
- acoes criticas devem ter ordem e hierarquia claras

## 8. Arquitetura Tecnica Atual
- frontend: Next.js App Router + TypeScript + Tailwind CSS
- componentes base: `shadcn/ui`
- estado temporario de preview: `local mode`
- backend preparado: Supabase + Trigger.dev + adaptadores de integracao

Decisao arquitetural da fase:
- manter a arquitetura de backend ja preparada
- estabilizar primeiro a camada de apresentacao
- conectar dados reais progressivamente, sem redesenhar a UX

## 9. Criticos de Aceite da Fase
A fase atual so pode ser considerada pronta quando:
- existir um SDD canonico coerente com o codigo atual
- o shell estiver estavel em desktop e mobile
- paginas prioritarias nao quebrarem em `local mode`
- `local mode` e fluxo normal compartilharem a mesma linguagem visual
- formularios, detalhes, tabelas e listagens estiverem consistentes
- a aplicacao estiver pronta para uma rodada manual de testes antes da integracao com Supabase

## 10. Proxima Etapa
Depois da estabilizacao:
- conectar progressivamente as paginas ao Supabase
- substituir mocks por dados reais preservando o mesmo shell
- validar autenticacao, contexto de workspace e persistencia
- habilitar testes de fluxo end-to-end com integracoes reais
- concluir fluxo OAuth/publicacao para Instagram e LinkedIn
