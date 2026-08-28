export function newestFirst(rows, dateOf) {
  return rows.slice().sort((a, b) => Date.parse(dateOf(b)) - Date.parse(dateOf(a)));
}
