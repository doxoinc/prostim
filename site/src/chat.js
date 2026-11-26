// Chat extras shared by the server (what it accepts) and the browser (what it shows):
// quick reactions on messages, an emoji panel and a sticker pack drawn with CSS, no image files.

export const chatReactions = ['❤️', '👍', '😂', '😮', '😢', '🔥', '👏', '🎮'];

export const chatEmoji = [
  '😀', '😁', '😂', '🥹', '😊', '😍', '🤩', '😎', '🤔', '😮', '😴', '🥲', '😅', '😢', '😡', '🤯',
  '👍', '👎', '👏', '🙌', '🙏', '💪', '🤝', '👀', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '✨',
  '🔥', '🎉', '🚀', '💡', '🎮', '🕹️', '🏆', '💰', '📈', '🐛', '🛠️', '💻', '📱', '🎨', '🎵', '☕'
];

// Each sticker: an emoji, a short caption and two colours for its badge.
export const chatStickers = [
  { id: 'gg', emoji: '🎮', label: 'GG', colors: ['#ff2e63', '#ffb03b'] },
  { id: 'release', emoji: '🚀', label: 'Релиз!', colors: ['#ff5f3d', '#ffd23f'] },
  { id: 'steam', emoji: '🕹️', label: 'В Steam!', colors: ['#5ec8ff', '#7c6cff'] },
  { id: 'bug', emoji: '🐛', label: 'Нашёл баг', colors: ['#3ddc84', '#1fa2ff'] },
  { id: 'fire', emoji: '🔥', label: 'Огонь', colors: ['#ff2e63', '#ff8a3d'] },
  { id: 'deadline', emoji: '☕', label: 'Дедлайн', colors: ['#b07a4f', '#ffb03b'] },
  { id: 'idea', emoji: '💡', label: 'Идея', colors: ['#ffd23f', '#ff8a3d'] },
  { id: 'wow', emoji: '🤯', label: 'Вау', colors: ['#c86bff', '#ff5ca8'] },
  { id: 'thanks', emoji: '🙏', label: 'Спасибо', colors: ['#5ec8ff', '#3ddc84'] },
  { id: 'ok', emoji: '👌', label: 'Принято', colors: ['#7c6cff', '#5ec8ff'] },
  { id: 'party', emoji: '🎉', label: 'Ура', colors: ['#ff5ca8', '#ffd23f'] },
  { id: 'love', emoji: '💜', label: 'Обожаю', colors: ['#c86bff', '#ff2e63'] }
];

export function stickerById(id) {
  return chatStickers.find(sticker => sticker.id === id) || null;
}

// Reactions as the viewer sees them: counts per emoji, and which one is theirs.
export function reactionSummary(reactions, meId) {
  const counts = {};
  for (const emoji of Object.values(reactions || {})) if (chatReactions.includes(emoji)) counts[emoji] = (counts[emoji] || 0) + 1;
  return { counts, mine: (reactions || {})[meId] || '' };
}
