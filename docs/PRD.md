# Documento de Requisitos de Produto (PRD) - Plataforma NevaPro

**Versão:** 2.0  
**Status:** Proposto  
**Data:** 13 de Agosto de 2026  
**Autor:** Equipe de Arquitetura & Engenharia NevaPro  

---

## 1. Visão Geral e Objetivos do Produto

### 1.1 Resumo Executivo

O **NevaPro** é uma plataforma SaaS educacional voltada à preparação de alta performance para o ENEM e vestibulares de grande concorrência. A plataforma combina banco de questões adaptativo, simulados cronometrados, caderno de erros inteligente, planos de estudo customizados, análises de desempenho preditivas e gamificação.

Esta versão 2.0 estende a plataforma para suportar **Multi-Tenancy** (multiarrendamento/multientidade por escolas, cursinhos, redes de ensino e grêmios) e **RBAC (Role-Based Access Control)** granular com suporte a permissões refinadas e isolamento lógico de dados.

### 1.2 Objetivos Estratégicos

1. **Multi-Tenancy Isolado e Escalável:** Permitir que diferentes instituições de ensino (Tenants) operem de forma isolada na mesma infraestrutura, personalizando seus materiais, simulados, avisos e rankings.
2. **Controle de Acesso Granular (RBAC):** Definir papéis hierárquicos (`super_admin`, `tenant_admin`, `teacher`, `student`) com permissões auditáveis por funcionalidade e tenant.
3. **Engajamento Gamificado:** Maximizar a retenção dos alunos através de sistemas de XP, níveis, conquistas (badges), sequências (streaks) e leaderboards locais e globais.
4. **Segurança e Conformidade com LGPD:** Garantir isolamento rigoroso de dados em nível de banco de dados (Row Level Security no Supabase / PostgreSQL) e auditoria de consentimento.

---

## 2. Personas de Usuário & Papéis (RBAC)

| Papel (Role) | Escopo | Descrição das Responsabilidades |
| :--- | :--- | :--- |
| **`super_admin`** | Plataforma Global | Administrador do sistema NevaPro. Possui controle total sobre a criação/gestão de Tenants, métricas globais de infraestrutura, gestão de faturamento/planos, e banco global de questões. |
| **`tenant_admin`** | Tenant / Instituição | Diretor ou coordenador pedagógico da instituição. Gerencia professores e alunos do tenant, configura regras da instituição, cria simulados institucionais e acessa relatórios consolidados do tenant. |
| **`teacher`** | Tenant / Turmas | Professor ou tutor da instituição. Pode criar e publicar questões, materiais de apoio, eventos de aula, montar simulados e acompanhar o desempenho individual e coletivo dos alunos de seu tenant. |
| **`student`** | Tenant / Pessoal | Aluno matriculado no tenant. Resolve questões/simulados, acessa o Caderno de Erros, plano de estudos, consome materiais de estudo, acumula XP e participa do ranking da sua instituição. |

---

## 3. Arquitetura de Multi-Tenancy

### 3.1 Modelo de Arrendamento (Multi-Tenancy Model)

- **Estratégia:** Pool Database com Isolamento por Coluna (`tenant_id`) e Row Level Security (RLS).
- **Identificação de Tenant:**
  - Cabeçalho HTTP: `X-Tenant-ID` ou subdomínio/slug URL (ex: `colegio-alpha.nevapro.com.br`).
  - Atribuição da sessão JWT / Cookie associando `user_id` e `tenant_id`.
- **Escopo de Dados:**
  - **Dados Isolados do Tenant:** Usuários, Matrículas, Materiais Didáticos, Eventos, Mural de Avisos, Respostas de Alunos, Estatísticas Diárias, Planos de Estudo.
  - **Dados Globais / Compartilhados (Opcional por Flag):** Banco Geral de Questões Oficiais ENEM (disponíveis para todos os tenants ou clonáveis para personalização).

---

## 4. Matriz de Permissões RBAC (Granular Permissions)

| Módulo / Funcionalidade | Permissão | `super_admin` | `tenant_admin` | `teacher` | `student` |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Tenants** | `tenants:manage` | ✔️ | ❌ | ❌ | ❌ |
| **Tenants** | `tenants:view_settings` | ✔️ | ✔️ | ❌ | ❌ |
| **Usuários** | `users:manage_admins` | ✔️ | ❌ | ❌ | ❌ |
| **Usuários** | `users:manage_teachers` | ✔️ | ✔️ | ❌ | ❌ |
| **Usuários** | `users:manage_students` | ✔️ | ✔️ | ✔️ | ❌ |
| **Usuários** | `users:view_self` | ✔️ | ✔️ | ✔️ | ✔️ |
| **Questões** | `questions:create` | ✔️ | ✔️ | ✔️ | ❌ |
| **Questões** | `questions:delete` | ✔️ | ✔️ | ❌ | ❌ |
| **Questões** | `questions:answer` | ✔️ | ✔️ | ✔️ | ✔️ |
| **Simulados** | `simulados:publish` | ✔️ | ✔️ | ✔️ | ❌ |
| **Simulados** | `simulados:take` | ✔️ | ✔️ | ✔️ | ✔️ |
| **Materiais** | `materials:upload` | ✔️ | ✔️ | ✔️ | ❌ |
| **Mural** | `mural:post` | ✔️ | ✔️ | ✔️ | ❌ |
| **Desempenho** | `analytics:tenant_summary` | ✔️ | ✔️ | ✔️ | ❌ |
| **Desempenho** | `analytics:own_performance` | ✔️ | ✔️ | ✔️ | ✔️ |

---

## 5. Requisitos Funcionais por Módulo

### 5.1 Módulo de Autenticação e Gestão de Sessão (Auth & Tenant Resolution)

- **RF-01:** O sistema deve autenticar usuários com suporte a login unificado e contexto automático de tenant.
- **RF-02:** Usuários associados a múltiplos tenants devem ter a capacidade de alternar o contexto de tenant ativo (Tenant Switcher).
- **RF-03:** Todas as requisições autenticadas devem ser validadas pelos middlewares de Autenticação, Tenant Context e RBAC Authorization.

### 5.2 Módulo de Questões e Simulados (Questions & Quizzes)

- **RF-04:** Suporte a questões de múltipla escolha com imagens de apoio, explicações detalhadas e tags de dificuldade (`fácil`, `médio`, `difícil`).
- **RF-05:** Simulados cronometrados com trava de navegação, contagem de tempo regressiva e cálculo automático de XP/Pontuação ao finalizar.
- **RF-06:** Histórico de respostas (`answers`) indexado por usuário e tenant para prevenção de dados cruzados.

### 5.3 Módulo Caderno de Erros (Errors Book)

- **RF-07:** Registro automático das questões respondidas incorretamente pelo aluno.
- **RF-08:** Filtros por disciplina, assunto e status de revisão, além de recomendações personalizadas com base na taxa de erro.

### 5.4 Módulo Plano de Estudos (Study Plan) & Calendário

- **RF-09:** Geração de agenda semanal por disciplina, foco e peso no vestibular.
- **RF-10:** Marcação de concluído em tópicos e sincronização com eventos da instituição/tenant.

### 5.5 Módulo Materiais e Mural (Content & Communication)

- **RF-11:** Upload e visualização segura de PDFs, vídeos e links de apoio.
- **RF-12:** Mural de avisos institucional categorizado por tags (`importante`, `geral`, `dica`, `estudos`) com controle de leitura por aluno.

### 5.6 Módulo de Gamificação & Leaderboards

- **RF-13:** Cálculo de XP por questão correta, streak de dias consecutivos e conquistas desbloqueadas (badges).
- **RF-14:** Ranking (Leaderboard) filtrável por Tenant, Escola, Cidade e Período (Semanal/Geral), com opção de privacidade para ocultar perfil.

---

## 6. Requisitos Não-Funcionais (RNF)

- **RNF-01 (Segurança & Isolamento):** Garantir 100% de isolamento entre tenants via RLS (Row Level Security) e restrições `WHERE tenant_id = $1` em todas as consultas SQL do servidor.
- **RNF-02 (Performance):** Resposta das APIs principais de resolução de questões e listagem em menos de 150ms (p95), com caching Redis/em memória para leaderboards e materiais.
- **RNF-03 (Conformidade LGPD):** Log de consentimento do usuário (`consent_logs`), direito ao esquecimento/exclusão de conta e mascaramento de dados sensíveis.
- **RNF-04 (Disponibilidade):** Arquitetura pronta para deploy serverless (Vercel) / contêiner (Docker + Nginx) com disponibilidade de 99.9%.

---

## 7. Estrutura Tecnológica (Tech Stack)

- **Frontend:** React 19, TypeScript, Vite, TailwindCSS v4, Framer Motion, Lucide React, Recharts.
- **Backend:** Node.js, Express, TypeScript, Middleware Pipeline (Auth, Tenant, RBAC, CSRF, Rate Limit).
- **Banco de Dados & Storage:** PostgreSQL + Supabase (RLS, Triggers, Indexes), Backblaze B2 / Amazon S3 para arquivos.
- **Observabilidade & Monitoramento:** Sentry (Node e React), Winston / Custom Logger, Backups automáticos de DB.
