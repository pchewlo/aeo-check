export default {
  id: 'table-headers',
  severity: 'warn',
  scope: 'markup',
  category: 'content',
  title: 'Tables have header cells',
  rationale: 'Retrieval flattens tables to text. Without labelled columns (<th>), the numbers lose their meaning once the table becomes plain text.',
  sources: ['x-jingg', 'x-boringlocal'],
  fix: 'Put column labels in <thead><tr><th>...</th></tr></thead>, and add a <caption> or a sentence saying what the table shows.',
  check(page) {
    return page.tables.filter((t) => !t.hasHeader && t.rows >= 2).map((t) => ({ line: t.line, message: `Table with ${t.rows} rows has no header cells.` }));
  },
};
