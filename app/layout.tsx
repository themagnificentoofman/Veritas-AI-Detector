import './globals.css';

export const metadata = {
  title: 'Veritas — AI Content Analysis',
  description: 'Explore media authenticity with Veritas.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 transition-colors duration-300">{children}</body></html>;
}
