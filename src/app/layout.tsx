import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'כמה אתם מכירים את אביה?',
  description: 'משחק קוויז ליום הולדת של אביה',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <body className={`${inter.className} bg-gradient-to-br from-purple-900 via-pink-800 to-orange-700 min-h-screen`}>
        {children}
      </body>
    </html>
  );
}
