/** Display labels for track slugs. Unknown slugs fall back to the slug with a capital letter. */
const LABELS = {
  agents: 'Agents', business: 'Business', defi: 'DeFi', games: 'Games', memecoins: 'Memecoins',
  nfts: 'NFTs', open: 'Open', privacy: 'Privacy', realworld: 'Real world', security: 'Security',
  social: 'Social', swarms: 'Swarms', thesis: 'Thesis',
};

export function trackLabel(slug) {
  return LABELS[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' ');
}
