# 🥥 Controle Financeiro — Coqueiros

Sistema simples e gratuito para gerenciar as finanças de uma plantação de coqueiros: controle de **entradas, saídas e imprevistos**, com gráficos, comprovantes em PDF e dados compartilhados com a família na nuvem.

### 🔗 Acesse ao vivo
**https://fwashington1999.github.io/Gerenciamento-Coqueiros/**

> Acesso protegido por senha da família.

---

## ✨ Funcionalidades

- **Lançamentos** de entradas, saídas e imprevistos, com valor, data, quantidade de cocos, **valor por coco**, descrição, categoria e forma de pagamento
- **Cálculo automático** do total (quantidade × valor por coco)
- **Indicadores (KPIs)** do ano: entradas, saídas, imprevistos e resultado
- **Gráficos**: movimento por mês (barras) e resultado acumulado (linha), com escala de valores
- **Comprovantes em PDF**: anexe e visualize o comprovante de cada lançamento
- **Exportar relatório em PDF** do ano (totais + tabela de lançamentos)
- **Login por senha única** da família
- **Dados na nuvem**, compartilhados entre todos os dispositivos
- **Responsivo**: funciona bem no computador e no celular

---

## 🛠️ Tecnologias

- **HTML, CSS e JavaScript** puro (sem frameworks, sem build)
- **[Supabase](https://supabase.com)** — banco de dados (PostgreSQL), autenticação e armazenamento dos PDFs
- **GitHub Pages** — hospedagem do site estático

---

## 📁 Estrutura

| Arquivo | Descrição |
|---|---|
| `index.html` | Estrutura da página (login + aplicativo) |
| `styles.css` | Aparência (cores, fontes, layout) |
| `app.js` | Lógica: cálculos, gráficos, exportação e conexão com o Supabase |
| `logo.png` | Logo do sistema |
| `supabase.sql` | Script que cria a tabela e o armazenamento no Supabase |

---

## 🔒 Segurança

- Os dados só são acessíveis para quem sabe a **senha da família**.
- O **RLS** bloqueia qualquer acesso não autenticado.
