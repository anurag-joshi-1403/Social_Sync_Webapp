// frontend/src/constants/platforms.js
// Platform metadata — colors, icons, names.
// Kept in a separate file so AccountsContext can be Fast-Refreshable.
// `maxChars` is each network's post length limit, used to warn when one
// cross-posted caption is too long for some of the chosen platforms.

export const PLATFORMS = [
  {
    id: 'instagram',
    name: 'Instagram',
    icon: 'bi-instagram',
    color: '#E1306C',
    gradient:
      'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
    description: 'Photo & video sharing',
    maxChars: 2200,
  },
  {
    id: 'facebook',
    name: 'Facebook',
    icon: 'bi-facebook',
    color: '#1877F2',
    gradient: 'linear-gradient(45deg, #1877F2, #0a54c4)',
    description: 'Social networking',
    maxChars: 63206,
  },
  {
    id: 'twitter',
    name: 'X (Twitter)',
    icon: 'bi-twitter-x',
    color: '#000000',
    gradient: 'linear-gradient(45deg, #000000, #333333)',
    description: 'Real-time microblogging',
    maxChars: 280,
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: 'bi-linkedin',
    color: '#0A66C2',
    gradient: 'linear-gradient(45deg, #0A66C2, #004182)',
    description: 'Professional networking',
    maxChars: 3000,
  },
];