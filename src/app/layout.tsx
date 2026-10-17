import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Wayfind Command Center',
  description: 'Private client reporting and export imports',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
