import '../styles/globals.css';

export const metadata = {
  title: 'PetBot Dashboard',
  description: 'Production WhatsApp consultation dashboard'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
