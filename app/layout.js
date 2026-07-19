import './globals.css';

export const metadata = {
  title: 'Cryptbound',
  description: 'A mobile-first 100-level dungeon crawler.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Cryptbound' }
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
