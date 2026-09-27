export function nextCalendarDate(value) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export const startOfIstanbulDay = (value) => `${value}T00:00:00+03:00`;
export const startOfNextIstanbulDay = (value) => `${nextCalendarDate(value)}T00:00:00+03:00`;

export function formatIstanbulDateTime(value) {
  if (!value) return { date: '', time: '' };
  const date = new Date(value);
  return {
    date: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date),
    time: new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false }).format(date),
  };
}
