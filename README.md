# Manga සිංහල පරිවර්තකය

PDF manga pages automatically සිංහලට translate කරන app එකක්.

## Setup

### 1. PDF.js worker file

`pdfjs-dist` package install කළාට පස්සේ worker file එක copy කරන්න:

```bash
npm install
cp node_modules/pdfjs-dist/build/pdf.worker.min.js public/pdf.worker.min.js
```

### 2. Locally run කරන්න

```bash
npm run dev
```

### 3. Vercel Deploy

**Step 1:** GitHub repo එකක් හදන්න, code push කරන්න:
```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/manga-translator.git
git push -u origin main
```

**Step 2:** [vercel.com](https://vercel.com) ගිහින් GitHub repo connect කරන්න.

**Step 3:** Vercel dashboard → Settings → Environment Variables:
```
ANTHROPIC_API_KEY = sk-ant-xxxxxxxxxxxxxxxx
```

**Step 4:** Redeploy කරන්න — ඔක්කොම හරි!

## Anthropic API Key ගන්නේ කොහොමද?

1. [console.anthropic.com](https://console.anthropic.com) ගිහින් account හදන්න
2. API Keys → Create Key
3. Copy කරලා Vercel environment variable එකේ paste කරන්න

## Features

- PDF upload (drag & drop හෝ click)
- Page navigate කරද්දී automatically translate වේ
- Translation cache — translate කළ pages නැවත API call නොවේ  
- Mobile responsive
- Dark mode UI
