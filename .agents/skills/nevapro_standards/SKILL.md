# NEVA Pro - Padrões de Desenvolvimento e Regras de Negócio

Este arquivo define as diretrizes, regras de negócio e restrições arquiteturais específicas do projeto **NEVA Pro**. Todo agente de IA ou desenvolvedor trabalhando neste repositório deve ler e seguir rigorosamente estas diretrizes ao alterar ou implementar funcionalidades.

---

## 1. Identidade Visual e Layout

### 1.1. Preservação da Logo Original
* **Regra**: Nunca altere, substitua ou oculte a logo original do projeto (`logo.png` / `logo_webapp.png`) sem solicitação explícita do usuário.
* **Contexto**: A logo original deve sempre aparecer de forma consistente no Header e nas telas de autenticação.

### 1.2. Tipografia e Textos do Backoffice
* **Regra**: Evite o uso da classe CSS `uppercase` (caixa alta) para textos comuns, cabeçalhos de tabela, inputs de formulário, títulos e badges no painel administrativo (Backoffice).
* **Contexto**: Use caixa mista padrão para maior elegibilidade e estética moderna. Para títulos curtos e badges discretos que requeiram destaque, prefira espaçamentos de letras suaves, como `tracking-wide` ou `tracking-wider` com texto em caixa mista, em vez de `tracking-widest` em caixa alta.

---

## 2. Regras de Negócio de Funcionalidades

### 2.1. Controle de Simulado e Prevenção de Saída
* **Regra**: Sempre que houver um simulado ativo (`isSimulationActive = true`), qualquer tentativa do aluno de sair da tela ou do sistema deve ser interceptada e protegida.
* **Componentes afetados**: [App.tsx](file:///c:/Users/bruno/OneDrive/Documents/GitHub/nevapro/nevapro/src/App.tsx) e [Simulados.tsx](file:///c:/Users/bruno/OneDrive/Documents/GitHub/nevapro/nevapro/src/components/Simulados.tsx).
* **Mecanismos de Interceptação**:
  1. **Navegação interna (Abas)**: Se o usuário clicar em uma nova aba na barra de navegação, salve a aba pretendida em um estado de aba pendente (`pendingTab`) e exiba o modal de confirmação.
  2. **Logout**: Se o usuário clicar em Sair (Logout) no header, trate como aba pendente contendo a rota de `'logout'` e exiba o modal de confirmação.
  3. **Recarga/Fechamento da Página**: Adicione um listener nativo de `beforeunload` para emitir o alerta padrão do navegador caso o simulado esteja ativo.
* **Modal de Confirmação**: O aluno deve ter duas opções:
  - **"Finalizar e ver resultados"**: Encerra o simulado, calcula os acertos/desempenho obtidos até aquele momento e redireciona para a rota/logout pendente.
  - **"Continuar respondendo"**: Cancela a navegação/logout e mantém o simulado ativo.

### 2.2. Regra de Atribuição de XP nos Simulados
* **Regra**: O cálculo de XP deve ser estritamente diferenciado se o aluno finalizar o simulado por completo ou se ele sair antecipadamente.
* **Fórmulas de Cálculo**:
  - **Conclusão Completa** (cronômetro zerado ou clicando no botão "Finalizar Simulado" na última questão): O aluno ganha a recompensa total configurada para o simulado (`selectedSim.xpReward`).
  - **Saída Antecipada** (clicando em "Finalizar e ver resultados" no modal de confirmação de saída antes do tempo ou das questões terminarem): O aluno ganha XP proporcional aos seus acertos em relação ao número total de questões:
    $$\text{XP Earned} = \text{Math.round}\left(\frac{\text{Acertos}}{\text{Total de Questões}} \times \text{xpReward}\right)$$
* **Código de referência**: A função `handleFinishSimulation(isCompleted: boolean)` em [Simulados.tsx](file:///c:/Users/bruno/OneDrive/Documents/GitHub/nevapro/nevapro/src/components/Simulados.tsx).

### 2.3. Seção "Usuário" nas Configurações (Settings)
* **Regra**: A aba de **Perfil** não deve conter opções de privacidade, consentimento de cookies ou exclusão de conta.
* **Organização**:
  - **Aba Privacidade**: Deve conter a seção "Usuário", dividida em:
    - **Preferências de Consentimento**: Container com cor laranja suave (`bg-orange-500/10` e borda `border-orange-500/25`).
    - **Zona de Perigo (Exclusão de Conta)**: Container vermelho de alerta (`bg-red-500/10` e borda `border-red-500/25`) contendo um aviso claro de ação destrutiva irreversível e um ícone de `AlertTriangle` animado.
* **Componente de referência**: [Settings.tsx](file:///c:/Users/bruno/OneDrive/Documents/GitHub/nevapro/nevapro/src/components/Settings.tsx).

### 2.4. Mural de Recados - Sem Categoria "Agenda"
* **Regra**: Não utilize nem faça referência à categoria `'agenda'` para recados/comunicações do mural. A agenda oficial é controlada exclusivamente pelo calendário do sistema.
* **Tipagem**: O tipo `NoticeCategory` no arquivo [types/index.ts](file:///c:/Users/bruno/OneDrive/Documents/GitHub/nevapro/nevapro/src/types/index.ts) não inclui `'agenda'`.
* **Componentes afetados**: [Mural.tsx](file:///c:/Users/bruno/OneDrive/Documents/GitHub/nevapro/nevapro/src/components/Mural.tsx) e [AdminDashboard.tsx](file:///c:/Users/bruno/OneDrive/Documents/GitHub/nevapro/nevapro/src/components/AdminDashboard.tsx).

---

## 3. Cálculos de XP e Progressão de Nível

### 3.1. Fórmula Proporcional de Nível
* **Regra**: A barra de progresso visual de nível do estudante em qualquer tela do app deve representar o avanço proporcional *dentro do nível atual*, e não do XP total acumulado.
* **Fórmula da Barra**:
  $$\text{Progresso (\%)} = \frac{\text{XP Atual} - \text{XP Mínimo do Nível}}{\text{XP Máximo do Nível} - \text{XP Mínimo do Nível}} \times 100$$
* **Utilitário de referência**: Use as funções exportadas por [xpUtils.ts](file:///c:/Users/bruno/OneDrive/Documents/GitHub/nevapro/nevapro/src/utils/xpUtils.ts).

### 3.2. Sincronização com o Banco de Dados (Supabase)
* **Regra**: Como a edição manual de XP diretamente no banco de dados não recalcula automaticamente a coluna `level` na tabela, o front-end deve recalcular dinamicamente o nível em tempo de execução ao ler os dados de XP, a fim de garantir sincronização visual exata.
* **Componentes afetados**: Leaderboard, Tabela de Alunos do Backoffice, Dashboard do Estudante.

---

## 4. Gestão de Arquivos e Armazenamento (Storage)
* **Regra**: Nenhum arquivo carregado pelo administrador na seção de "Materiais" deve ser salvo no disco local do servidor ou versionado no Git. Todo o armazenamento de arquivos deve ser delegado ao Supabase Storage.
* **Configuração do Servidor**: A pasta `uploads/` está configurada no `.gitignore` para desenvolvimento local. O arquivo `vercel.json` e as rotas em `server.ts` foram simplificadas para remover lógica de salvamento em diretórios locais.
