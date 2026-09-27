function pad(value) {
  return String(value).padStart(2, '0');
}

function capitalizeWords(value) {
  return value
    .split(' ')
    .map((word) => {
      if (!word) return word;
      return word.charAt(0).toLocaleUpperCase('tr-TR') + word.slice(1);
    })
    .join(' ');
}

export function toDateKey(date) {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `${year}-${month}-${day}`;
}

export function getStartOfWeek(date) {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  const day = clone.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  clone.setDate(clone.getDate() + diff);
  return clone;
}

export function getWeekDates(date) {
  const start = getStartOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(start);
    current.setDate(start.getDate() + index);
    return current;
  });
}

export function formatWeekdayLabel(date) {
  return date.toLocaleDateString('tr-TR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

export function formatLongDateTime(date) {
  return {
    dateLabel: capitalizeWords(date.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      weekday: 'long',
    })),
    timeLabel: date.toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  };
}

export function isShiftActive(saatAraligi, now = new Date()) {
  if (!saatAraligi || !saatAraligi.includes('-')) {
    return false;
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [startMinutes, endMinutes] = saatAraligi.split('-').map((slot) => {
    const [hour, minute] = slot.trim().split(':').map(Number);
    return hour * 60 + minute;
  });

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

export function compareShiftDatesDesc(left, right) {
  const leftCreatedAt = left.createdAt?.seconds ?? 0;
  const rightCreatedAt = right.createdAt?.seconds ?? 0;

  if (leftCreatedAt !== rightCreatedAt) {
    return rightCreatedAt - leftCreatedAt;
  }

  return `${right.tarih || ''}${right.saatAraligi || ''}`.localeCompare(`${left.tarih || ''}${left.saatAraligi || ''}`, 'tr');
}