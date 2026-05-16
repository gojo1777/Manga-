import "./globals.css";

export const metadata = {
  title: "Manga සිංහල පරිවර්තකය",
  description: "Manga PDF සිංහලට පරිවර්තනය කරන්න",
};

export default function RootLayout({ children }) {
  return (
    <html lang="si">
      <body>{children}</body>
    </html>
  );
}
