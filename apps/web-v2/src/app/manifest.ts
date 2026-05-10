import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MenuHub Platform',
    short_name: 'MenuHub',
    description: 'Totem e App Garcom em modo PWA para operacao local.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f3f6ff',
    theme_color: '#2557f6',
    orientation: 'portrait',
    icons: [
      {
        src: '/icons/menuhub-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
