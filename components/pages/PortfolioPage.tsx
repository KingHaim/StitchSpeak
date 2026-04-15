import React from 'react';

interface PatternShowcase {
  name: string;
  designer: string;
  fromLang: string;
  toLang: string;
  category: string;
  gradient: string;
}

const SHOWCASE: PatternShowcase[] = [
  { name: 'Cable Knit Sweater', designer: 'Emma Stitch', fromLang: 'English', toLang: 'Spanish', category: 'Sweater', gradient: 'from-amber-100 to-orange-100' },
  { name: 'Cozy Striped Blanket', designer: 'Lana Creations', fromLang: 'English', toLang: 'German', category: 'Blanket', gradient: 'from-blue-100 to-indigo-100' },
  { name: 'Weekend Beanie', designer: 'Nordic Knits', fromLang: 'Norwegian', toLang: 'English', category: 'Hat', gradient: 'from-green-100 to-emerald-100' },
  { name: 'Ribbed Socks', designer: 'Sockmania', fromLang: 'German', toLang: 'Portuguese', category: 'Socks', gradient: 'from-rose-100 to-pink-100' },
  { name: 'Lace Shawl Elegance', designer: 'Marie Fil', fromLang: 'French', toLang: 'English', category: 'Shawl', gradient: 'from-purple-100 to-violet-100' },
  { name: 'Baby Cardigan', designer: 'Petit Maille', fromLang: 'French', toLang: 'Spanish', category: 'Cardigan', gradient: 'from-yellow-100 to-amber-100' },
  { name: 'Fair Isle Mittens', designer: 'Highland Wool', fromLang: 'English', toLang: 'German', category: 'Mittens', gradient: 'from-teal-100 to-cyan-100' },
  { name: 'Raglan Pullover', designer: 'Maria Lã', fromLang: 'Portuguese', toLang: 'English', category: 'Pullover', gradient: 'from-orange-100 to-red-100' },
  { name: 'Seed Stitch Cowl', designer: 'Wooly Wonders', fromLang: 'English', toLang: 'French', category: 'Cowl', gradient: 'from-lime-100 to-green-100' },
  { name: 'Crochet Amigurumi Bear', designer: 'Punto Mágico', fromLang: 'Spanish', toLang: 'English', category: 'Amigurumi', gradient: 'from-fuchsia-100 to-pink-100' },
  { name: "Fisherman's Rib Scarf", designer: 'Strickzeit', fromLang: 'German', toLang: 'English', category: 'Scarf', gradient: 'from-sky-100 to-blue-100' },
  { name: 'Yoke Dress', designer: 'Fio de Ouro', fromLang: 'Portuguese', toLang: 'French', category: 'Dress', gradient: 'from-amber-100 to-yellow-100' },
  { name: 'Mosaic Cushion Cover', designer: 'ColorCraft', fromLang: 'English', toLang: 'Spanish', category: 'Home Decor', gradient: 'from-indigo-100 to-purple-100' },
  { name: 'Top-Down Tee', designer: 'Aiguilles & Cie', fromLang: 'French', toLang: 'German', category: 'Top', gradient: 'from-emerald-100 to-teal-100' },
  { name: 'Brioche Hat', designer: 'Knit Nordic', fromLang: 'Norwegian', toLang: 'Spanish', category: 'Hat', gradient: 'from-red-100 to-orange-100' },
  { name: 'Granny Square Bag', designer: 'Crochet Love', fromLang: 'English', toLang: 'Portuguese', category: 'Bag', gradient: 'from-violet-100 to-fuchsia-100' },
];

export const PortfolioPage: React.FC = () => {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-brand-800 mb-1">Pattern Portfolio</h2>
        <p className="text-brand-400">A showcase of patterns translated with StitchSpeak</p>
      </div>

      <div className="bg-brand-100/40 border border-brand-200 rounded-2xl p-6 mb-8">
        <div className="flex items-center gap-3">
          <div className="bg-brand-600 text-white text-lg font-bold w-12 h-12 rounded-xl flex items-center justify-center shrink-0">
            {SHOWCASE.length}+
          </div>
          <div>
            <p className="font-semibold text-brand-800">Patterns Translated</p>
            <p className="text-sm text-brand-400">Professional knitting and crochet pattern translations across multiple languages</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {SHOWCASE.map((item, idx) => (
          <div
            key={idx}
            className="bg-white rounded-2xl shadow-sm border border-brand-200 overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all"
          >
            <div className={`h-32 bg-gradient-to-br ${item.gradient} flex items-center justify-center`}>
              <svg className="w-12 h-12 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
            </div>
            <div className="p-4">
              <h3 className="font-semibold text-brand-800 text-sm mb-1 truncate">{item.name}</h3>
              <p className="text-xs text-brand-400 mb-3">{item.designer}</p>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-400 bg-brand-100 px-2 py-0.5 rounded">
                  {item.category}
                </span>
                <span className="text-[10px] font-medium text-brand-500">
                  {item.fromLang} → {item.toLang}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
