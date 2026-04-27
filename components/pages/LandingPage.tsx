import React, { useState } from 'react';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { useAuth } from '../../contexts/AuthContext';
import { getGoogleOAuthClientId } from '../../auth/googleConfig';
import { CREDIT_PACKAGES, LANGUAGES, PENDING_BUY_CREDITS_PACK_INDEX_KEY } from '../../constants';
import { CloseIcon } from '../icons/CloseIcon';
import { DashboardPage } from './DashboardPage';

type LandingView = 'home' | 'translate';
type PatternSampleId = 'cables' | 'lace' | 'chart' | 'glossary' | 'heel';

interface PatternSample {
  id: PatternSampleId;
  title: string;
  subtitle: string;
  icon: string;
  accent: string;
  source: string[];
  translations: Record<string, string[]>;
}

const scrollToId = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
};

const Icon: React.FC<{ name: string; className?: string }> = ({ name, className }) => (
  <span className={`material-symbols-outlined ${className ?? ''}`} aria-hidden>
    {name}
  </span>
);

const LANGUAGE_FLAGS: Record<string, string> = {
  en: '🇺🇸',
  de: '🇩🇪',
  fr: '🇫🇷',
  es: '🇪🇸',
  it: '🇮🇹',
  nl: '🇳🇱',
  sv: '🇸🇪',
  no: '🇳🇴',
  da: '🇩🇰',
  fi: '🇫🇮',
  pt: '🇵🇹',
  ja: '🇯🇵',
  ru: '🇷🇺',
};

const PATTERN_SAMPLES: PatternSample[] = [
  {
    id: 'cables',
    title: 'Complex cables',
    subtitle: 'Abbreviations stay precise while the instruction becomes readable.',
    icon: 'cable',
    accent: 'from-primary/20 via-secondary-container/40 to-surface-container',
    source: [
      'Row 12 (RS): P2, C6F, k4, C6B, p2; rep from * to end.',
      'Row 13 (WS): K2, p16, k2.',
      'Continue in cable panel until piece measures 18 cm from CO edge.',
    ],
    translations: {
      en: [
        'Row 12 (RS): P2, C6F, k4, C6B, p2; rep from * to end.',
        'Row 13 (WS): K2, p16, k2.',
        'Continue in cable panel until piece measures 18 cm from CO edge.',
      ],
      de: [
        'R 12 (VS): 2 li, Z6V, 4 re, Z6H, 2 li; ab * bis Reihenende wdh.',
        'R 13 (RS): 2 re, 16 li, 2 re.',
        'Im Zopfmuster weiterstricken, bis das Teil ab Anschlagkante 18 cm misst.',
      ],
      fr: [
        'Rang 12 (end): 2 m env, T6AV, 4 m end, T6AR, 2 m env; rep depuis * jusqu\'a la fin.',
        'Rang 13 (env): 2 m end, 16 m env, 2 m end.',
        'Continuer le panneau de torsades jusqu\'a 18 cm depuis le montage.',
      ],
      es: [
        'Fila 12 (LD): 2 rev, Tr6D, 4 der, Tr6Det, 2 rev; rep desde * hasta el final.',
        'Fila 13 (LR): 2 der, 16 rev, 2 der.',
        'Continuar el panel de trenzas hasta que mida 18 cm desde el montaje.',
      ],
      it: [
        'Ferro 12 (LD): 2 rov, T6D, 4 dir, T6R, 2 rov; rip da * fino alla fine.',
        'Ferro 13 (LR): 2 dir, 16 rov, 2 dir.',
        'Continuare il pannello a trecce finche misura 18 cm dal bordo di avvio.',
      ],
      nl: [
        'Naald 12 (GK): 2 av, K6V, 4 r, K6A, 2 av; herh vanaf * tot einde.',
        'Naald 13 (VK): 2 r, 16 av, 2 r.',
        'Ga verder in het kabelpaneel tot het werk 18 cm vanaf de opzet meet.',
      ],
      sv: [
        'Varv 12 (RS): 2 am, F6F, 4 rm, F6B, 2 am; upprepa från * varvet ut.',
        'Varv 13 (AS): 2 rm, 16 am, 2 rm.',
        'Fortsätt med flätpanelen tills arbetet mäter 18 cm från uppläggningskanten.',
      ],
      no: [
        'Pinne 12 (RS): 2 vr, F6F, 4 r, F6B, 2 vr; gjenta fra * ut pinnen.',
        'Pinne 13 (VS): 2 r, 16 vr, 2 r.',
        'Fortsett med flettepanelet til arbeidet måler 18 cm fra oppleggskanten.',
      ],
      da: [
        'Pind 12 (RS): 2 vr, F6F, 4 r, F6B, 2 vr; gentag fra * pinden ud.',
        'Pind 13 (VS): 2 r, 16 vr, 2 r.',
        'Fortsæt i snoningspanelet til arbejdet måler 18 cm fra opslagningen.',
      ],
      fi: [
        'Kerros 12 (OP): 2 n, P6E, 4 o, P6T, 2 n; toista *:sta kerroksen loppuun.',
        'Kerros 13 (NP): 2 o, 16 n, 2 o.',
        'Jatka palmikkopaneelia, kunnes kappaleen pituus on 18 cm luontireunasta.',
      ],
      pt: [
        'Carr 12 (LD): 2 t, Tr6F, 4 m, Tr6A, 2 t; rep a partir de * ate o fim.',
        'Carr 13 (LA): 2 m, 16 t, 2 m.',
        'Continue no painel de trancas ate a peca medir 18 cm desde a montagem.',
      ],
      ja: [
        '12段目（表）: 裏2目、C6F、表4目、C6B、裏2目。*から段の終わりまで繰り返す。',
        '13段目（裏）: 表2目、裏16目、表2目。',
        '作り目から18cmになるまでケーブル模様を続ける。',
      ],
      ru: [
        'Ряд 12 (ЛС): 2 изн, C6F, 4 лиц, C6B, 2 изн; повт. от * до конца.',
        'Ряд 13 (ИС): 2 лиц, 16 изн, 2 лиц.',
        'Продолжайте панель с косами, пока деталь не достигнет 18 см от наборного края.',
      ],
    },
  },
  {
    id: 'lace',
    title: 'Lace repeat',
    subtitle: 'Yarn overs, decreases, and repeat language remain easy to follow.',
    icon: 'filter_vintage',
    accent: 'from-secondary-container/70 via-surface-container-low to-tertiary-fixed/50',
    source: [
      'Row 1 (RS): K1, *yo, ssk, k3, k2tog, yo, k1; rep from *.',
      'Row 2 and all WS rows: Purl.',
      'Work Rows 1-8 twice before beginning the border.',
    ],
    translations: {
      en: [
        'Row 1 (RS): K1, *yo, ssk, k3, k2tog, yo, k1; rep from *.',
        'Row 2 and all WS rows: Purl.',
        'Work Rows 1-8 twice before beginning the border.',
      ],
      de: [
        'R 1 (VS): 1 re, *U, 2 re überz zus, 3 re, 2 re zus, U, 1 re; ab * wdh.',
        'R 2 und alle Rückreihen: links stricken.',
        'Reihen 1-8 zweimal arbeiten, dann mit der Blende beginnen.',
      ],
      fr: [
        'Rang 1 (end): 1 m end, *jete, GGT, 3 m end, 2 m ens end, jete, 1 m end; rep depuis *.',
        'Rang 2 et tous les rangs env: tricoter a l\'envers.',
        'Travailler les rangs 1-8 deux fois avant de commencer la bordure.',
      ],
      es: [
        'Fila 1 (LD): 1 der, *hebra, DDR, 3 der, 2pjD, hebra, 1 der; rep desde *.',
        'Fila 2 y todas las filas LR: tejer del reves.',
        'Trabajar las filas 1-8 dos veces antes de comenzar el borde.',
      ],
      it: [
        'Ferro 1 (LD): 1 dir, *gett, acc, 3 dir, 2 ins dir, gett, 1 dir; rip da *.',
        'Ferro 2 e tutti i ferri LR: lavorare a rovescio.',
        'Lavorare i ferri 1-8 due volte prima di iniziare il bordo.',
      ],
      nl: [
        'Naald 1 (GK): 1 r, *omslag, afh-afh-r, 3 r, 2 r samen, omslag, 1 r; herh vanaf *.',
        'Naald 2 en alle VK-naalden: averecht breien.',
        'Brei naalden 1-8 twee keer voor je aan de rand begint.',
      ],
      sv: [
        'Varv 1 (RS): 1 rm, *omsl, lyft-lyft-sticka, 3 rm, 2 rm tills, omsl, 1 rm; upprepa från *.',
        'Varv 2 och alla AS-varv: aviga maskor.',
        'Sticka varv 1-8 två gånger innan kanten påbörjas.',
      ],
      no: [
        'Pinne 1 (RS): 1 r, *kast, ssk, 3 r, 2 r sm, kast, 1 r; gjenta fra *.',
        'Pinne 2 og alle VS-pinner: strikk vrangt.',
        'Strikk pinne 1-8 to ganger før kanten begynnes.',
      ],
      da: [
        'Pind 1 (RS): 1 r, *slå om, ssk, 3 r, 2 r sm, slå om, 1 r; gentag fra *.',
        'Pind 2 og alle VS-pinde: strik vrang.',
        'Strik pind 1-8 to gange før kanten begyndes.',
      ],
      fi: [
        'Kerros 1 (OP): 1 o, *lk, ylivetokavennus, 3 o, 2 o yht, lk, 1 o; toista *:sta.',
        'Kerros 2 ja kaikki NP-kerrokset: neulo nurin.',
        'Neulo kerrokset 1-8 kahdesti ennen reunuksen aloittamista.',
      ],
      pt: [
        'Carr 1 (LD): 1 m, *lac, dde, 3 m, 2pjm, lac, 1 m; rep a partir de *.',
        'Carr 2 e todas as carr LA: tricotar em ponto t.',
        'Trabalhe as carr 1-8 duas vezes antes de iniciar a borda.',
      ],
      ja: [
        '1段目（表）: 表1目、*かけ目、SSK、表3目、左上2目一度、かけ目、表1目。*から繰り返す。',
        '2段目とすべての裏段: 裏編み。',
        '縁編みに入る前に1-8段を2回編む。',
      ],
      ru: [
        'Ряд 1 (ЛС): 1 лиц, *накид, SSK, 3 лиц, 2 лиц вместе, накид, 1 лиц; повт. от *.',
        'Ряд 2 и все ряды ИС: вязать изнаночными.',
        'Провяжите ряды 1-8 два раза перед началом каймы.',
      ],
    },
  },
  {
    id: 'chart',
    title: 'Chart legend',
    subtitle: 'A compact symbol key becomes searchable, local terminology.',
    icon: 'grid_on',
    accent: 'from-tertiary-fixed/80 via-surface-container to-primary-fixed/60',
    source: [
      '□ = knit on RS, purl on WS',
      '○ = yarn over',
      '/ = k2tog',
      '\\ = ssk',
    ],
    translations: {
      en: ['□ = knit on RS, purl on WS', '○ = yarn over', '/ = k2tog', '\\ = ssk'],
      de: ['□ = rechts auf VS, links auf RS', '○ = Umschlag', '/ = 2 re zusammen', '\\ = 2 re überzogen zusammen'],
      fr: ['□ = endroit sur l\'end, envers sur l\'env', '○ = jete', '/ = 2 m ens end', '\\ = GGT'],
      es: ['□ = derecho en LD, reves en LR', '○ = hebra / lazada', '/ = 2pjD', '\\ = DDR'],
      it: ['□ = diritto su LD, rovescio su LR', '○ = gettato', '/ = 2 ins dir', '\\ = accavallata semplice'],
      nl: ['□ = recht op GK, averecht op VK', '○ = omslag', '/ = 2 recht samen', '\\ = ssk'],
      sv: ['□ = rät på RS, avig på AS', '○ = omslag', '/ = 2 rm tillsammans', '\\ = ssk'],
      no: ['□ = rett på RS, vrang på VS', '○ = kast', '/ = 2 r sammen', '\\ = ssk'],
      da: ['□ = ret på RS, vrang på VS', '○ = slå om', '/ = 2 ret sammen', '\\ = ssk'],
      fi: ['□ = oikein OP:lla, nurin NP:lla', '○ = langankierto', '/ = 2 oikein yhteen', '\\ = ylivetokavennus'],
      pt: ['□ = meia no LD, tricô no LA', '○ = laçada', '/ = 2 pontos juntos em meia', '\\ = dde'],
      ja: ['□ = 表側は表目、裏側は裏目', '○ = かけ目', '/ = 左上2目一度', '\\ = SSK'],
      ru: ['□ = лиц. на ЛС, изн. на ИС', '○ = накид', '/ = 2 лиц вместе', '\\ = SSK'],
    },
  },
  {
    id: 'glossary',
    title: 'Glossary terms',
    subtitle: 'Abbreviation-heavy notes keep both shorthand and meaning.',
    icon: 'menu_book',
    accent: 'from-primary-fixed/80 via-surface-container-low to-secondary-container/50',
    source: [
      'CO 48 sts using the long-tail method.',
      'PM for BOR and join to work in the rnd.',
      'Work k2, p2 rib for 12 rnds.',
    ],
    translations: {
      en: ['CO 48 sts using the long-tail method.', 'PM for BOR and join to work in the rnd.', 'Work k2, p2 rib for 12 rnds.'],
      de: ['48 M mit Kreuzanschlag anschlagen.', 'MM für Rd-Anfang setzen und zur Runde schließen.', '12 Rd im Bündchenmuster 2 re, 2 li arbeiten.'],
      fr: ['Monter 48 m avec la methode long-tail.', 'Placer un marqueur pour le debut du tour et joindre en rond.', 'Travailler 12 tours en cotes 2 end, 2 env.'],
      es: ['Montar 48 p con el metodo long-tail.', 'Colocar marcador para el inicio de vuelta y unir para tejer en circular.', 'Tejer elastico 2 der, 2 rev durante 12 vueltas.'],
      it: ['Avviare 48 m con il metodo long-tail.', 'Mettere un marcapunti per l\'inizio giro e unire in tondo.', 'Lavorare coste 2 dir, 2 rov per 12 giri.'],
      nl: ['Zet 48 st op met de long-tail methode.', 'Plaats markeerder voor begin ronde en sluit tot een ronde.', 'Brei 12 rondes boordsteek 2 r, 2 av.'],
      sv: ['Lägg upp 48 m med long-tail-uppläggning.', 'Placera markör för varvets början och slut till rundstickning.', 'Sticka resår 2 rm, 2 am i 12 varv.'],
      no: ['Legg opp 48 m med long-tail-opplegg.', 'Sett markør for omgangens begynnelse og samle til rundstrikk.', 'Strikk 2 r, 2 vr vrangbord i 12 omg.'],
      da: ['Slå 48 m op med long-tail opslagning.', 'Sæt markør for omgangens begyndelse og saml til rundstrik.', 'Strik 2 r, 2 vr rib i 12 omgange.'],
      fi: ['Luo 48 s long-tail-menetelmällä.', 'Aseta merkki kerroksen alkuun ja yhdistä suljetuksi neuleeksi.', 'Neulo 2 o, 2 n joustinneuletta 12 kerrosta.'],
      pt: ['Monte 48 pts usando o metodo long-tail.', 'Coloque marcador para o inicio da volta e una para trabalhar em circular.', 'Trabalhe barra 2 m, 2 t por 12 voltas.'],
      ja: ['ロングテール式で48目作り目する。', '段の始まりにマーカーを置き、輪にして編む。', '表2目、裏2目のゴム編みを12周編む。'],
      ru: ['Наберите 48 п. способом long-tail.', 'Поставьте маркер начала ряда и соедините вязание в круг.', 'Вяжите резинку 2 лиц, 2 изн в течение 12 круг. рядов.'],
    },
  },
  {
    id: 'heel',
    title: 'Sock heel section',
    subtitle: 'Construction instructions keep their shape across languages.',
    icon: 'steps',
    accent: 'from-surface-container-high via-primary-fixed/60 to-tertiary-fixed/50',
    source: [
      'Heel flap: Sl1, k1 across 28 sts. Turn.',
      'Next row: Sl1, purl to end. Rep these 2 rows 14 times.',
      'Turn heel: Sl1, p15, p2tog, p1, turn.',
    ],
    translations: {
      en: ['Heel flap: Sl1, k1 across 28 sts. Turn.', 'Next row: Sl1, purl to end. Rep these 2 rows 14 times.', 'Turn heel: Sl1, p15, p2tog, p1, turn.'],
      de: ['Fersenwand: 1 M abh, 1 re über 28 M. Wenden.', 'Nächste R: 1 M abh, links bis Ende. Diese 2 R 14-mal wdh.', 'Ferse formen: 1 M abh, 15 li, 2 li zus, 1 li, wenden.'],
      fr: ['Rabat de talon: gl 1, 1 m end sur 28 m. Tourner.', 'Rang suiv: gl 1, tricoter a l\'envers jusqu\'a la fin. Rep ces 2 rangs 14 fois.', 'Tourner le talon: gl 1, 15 m env, 2 m ens env, 1 m env, tourner.'],
      es: ['Talón: desl1, 1 der a lo largo de 28 p. Girar.', 'Fila sig: desl1, tejer reves hasta el final. Rep estas 2 filas 14 veces.', 'Dar forma al talon: desl1, 15 rev, 2pjR, 1 rev, girar.'],
      it: ['Patta del tallone: pass 1, 1 dir su 28 m. Girare.', 'Ferro succ: pass 1, rov fino alla fine. Rip questi 2 ferri 14 volte.', 'Sagomare il tallone: pass 1, 15 rov, 2 rov ins, 1 rov, girare.'],
      nl: ['Hielflap: haal 1 af, 1 r over 28 st. Keer.', 'Volgende naald: haal 1 af, averecht tot einde. Herh deze 2 naalden 14 keer.', 'Hiel keren: haal 1 af, 15 av, 2 av samen, 1 av, keer.'],
      sv: ['Hällapp: lyft 1, 1 rm över 28 m. Vänd.', 'Nästa varv: lyft 1, sticka avigt varvet ut. Upprepa dessa 2 varv 14 gånger.', 'Vänd hälen: lyft 1, 15 am, 2 am tills, 1 am, vänd.'],
      no: ['Hælkappe: ta 1 løs av, 1 r over 28 m. Snu.', 'Neste pinne: ta 1 løs av, strikk vrangt ut pinnen. Gjenta disse 2 pinnene 14 ganger.', 'Snu hælen: ta 1 løs av, 15 vr, 2 vr sm, 1 vr, snu.'],
      da: ['Hælkappe: tag 1 løst af, 1 r over 28 m. Vend.', 'Næste pind: tag 1 løst af, strik vrang pinden ud. Gentag disse 2 pinde 14 gange.', 'Vend hælen: tag 1 løst af, 15 vr, 2 vr sm, 1 vr, vend.'],
      fi: ['Kantalappu: nosta 1 s, 1 o yhteensä 28 s. Käännä.', 'Seuraava kerros: nosta 1 s, neulo nurin loppuun. Toista näitä 2 kerrosta 14 kertaa.', 'Kantapään käännös: nosta 1 s, 15 n, 2 n yht, 1 n, käännä.'],
      pt: ['Aba do calcanhar: desl1, 1 m por 28 pts. Vire.', 'Carr seg: desl1, tricote em t ate o fim. Rep estas 2 carr 14 vezes.', 'Virar o calcanhar: desl1, 15 t, 2pjT, 1 t, vire.'],
      ja: ['かかとフラップ: 1目すべり、表1目を28目分編む。返す。', '次の段: 1目すべり、段の終わりまで裏編み。この2段を14回繰り返す。', 'かかとの返し: 1目すべり、裏15目、裏2目一度、裏1目、返す。'],
      ru: ['Стенка пятки: снять 1 п., 1 лиц на 28 п. Повернуть.', 'След. ряд: снять 1 п., вязать изн. до конца. Повт. эти 2 ряда 14 раз.', 'Поворот пятки: снять 1 п., 15 изн, 2 изн вместе, 1 изн, повернуть.'],
    },
  },
];

interface LandingGoogleSignInProps {
  layout: 'header' | 'hero' | 'modal';
  clientId: string | undefined;
  onSuccess: (res: CredentialResponse) => void;
}

/** Match former header CTAs (~44px tall). */
const LANDING_GOOGLE_BTN_HEIGHT_PX = 44;

/** Multicolor G — used on custom-styled sign-in; real click target is an invisible Google-rendered button on top. */
function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

const LandingGoogleSignIn: React.FC<LandingGoogleSignInProps> = ({ layout, clientId, onSuccess }) => {
  if (!clientId) return null;
  const widthPx = layout === 'hero' ? 200 : layout === 'modal' ? 240 : 180;

  return (
    <div
      className={`relative inline-flex shrink-0 rounded-xl focus-within:ring-2 focus-within:ring-primary/35 focus-within:ring-offset-2 focus-within:ring-offset-background ${
        layout === 'modal' ? 'mx-auto' : ''
      }`}
      style={{ width: widthPx, height: LANDING_GOOGLE_BTN_HEIGHT_PX }}
    >
      <div
        className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary shadow-lg shadow-primary/15"
        aria-hidden
      >
        <GoogleMark className="h-5 w-5 shrink-0" />
        Sign in
      </div>
      <div className="absolute inset-0 z-10 overflow-hidden opacity-0 [&>div]:!flex [&>div]:!h-full [&>div]:!w-full [&>div]:!items-stretch [&_iframe]:!h-full [&_iframe]:!min-h-0 [&_iframe]:!w-full [&_iframe]:!shadow-none">
        <GoogleLogin
          onSuccess={onSuccess}
          onError={() => {}}
          theme="outline"
          size="large"
          text="signin"
          shape="rectangular"
          logo_alignment="left"
          width={widthPx}
          containerProps={{
            className: '!flex h-full w-full items-stretch',
            style: {
              height: '100%',
              minHeight: LANDING_GOOGLE_BTN_HEIGHT_PX,
              width: '100%',
            },
          }}
        />
      </div>
    </div>
  );
};

export const LandingPage: React.FC = () => {
  const { signInWithGoogleCredential } = useAuth();
  const clientId = getGoogleOAuthClientId();
  const [view, setView] = useState<LandingView>('home');
  const [showCreditPurchaseModal, setShowCreditPurchaseModal] = useState(false);
  const [selectedSampleId, setSelectedSampleId] = useState<PatternSampleId>('cables');
  const [selectedLanguageCode, setSelectedLanguageCode] = useState('de');
  const selectedSample = PATTERN_SAMPLES.find((sample) => sample.id === selectedSampleId) ?? PATTERN_SAMPLES[0];
  const selectedLanguage = LANGUAGES.find((language) => language.code === selectedLanguageCode) ?? LANGUAGES[0];
  const translatedLines = selectedSample.translations[selectedLanguage.code] ?? selectedSample.source;

  const clearPendingCreditPack = () => {
    try {
      sessionStorage.removeItem(PENDING_BUY_CREDITS_PACK_INDEX_KEY);
    } catch {
      /* ignore */
    }
  };

  const closeCreditPurchaseModal = () => {
    clearPendingCreditPack();
    setShowCreditPurchaseModal(false);
  };

  const openCreditPurchaseFlow = (packIndex: number) => {
    try {
      sessionStorage.setItem(PENDING_BUY_CREDITS_PACK_INDEX_KEY, String(packIndex));
    } catch {
      /* ignore */
    }
    setShowCreditPurchaseModal(true);
  };

  const handleGoogleSuccess = (res: CredentialResponse) => {
    if (res.credential) {
      signInWithGoogleCredential(res.credential);
    }
  };

  if (view === 'translate') {
    return (
      <div className="min-h-screen bg-background text-on-surface font-body">
        <header className="bg-background/80 dark:bg-on-surface/80 backdrop-blur-md sticky top-0 z-50 shadow-sm dark:shadow-none border-b border-outline-variant/15">
          <div className="flex justify-between items-center px-6 sm:px-8 py-4 max-w-7xl mx-auto">
            <button
              type="button"
              onClick={() => setView('home')}
              className="flex items-center gap-0 min-w-0 text-left hover:opacity-80 transition-opacity"
            >
              <img src="/logo.png" alt="" className="h-10 w-10 shrink-0 object-contain" />
              <span className="font-headline text-xl font-bold text-on-surface dark:text-background truncate">
                StitchSpeak
              </span>
            </button>
            <div className="flex items-center shrink-0">
              <LandingGoogleSignIn layout="header" clientId={clientId} onSuccess={handleGoogleSuccess} />
            </div>
          </div>
        </header>
        <div className="px-6 sm:px-8 py-8 max-w-7xl mx-auto">
          <DashboardPage />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-on-surface font-body selection:bg-primary-fixed selection:text-on-primary-fixed">
      <header className="bg-background/80 dark:bg-on-surface/80 backdrop-blur-md sticky top-0 z-50 shadow-sm dark:shadow-none border-b border-outline-variant/15">
        <div className="flex justify-between items-center gap-4 px-6 sm:px-8 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-0 min-w-0 shrink-0">
            <img src="/logo.png" alt="" className="h-10 w-10 shrink-0 object-contain" />
            <span className="font-headline text-xl font-bold text-on-surface dark:text-background truncate">
              StitchSpeak
            </span>
          </div>
          <div className="flex items-center shrink-0">
            <LandingGoogleSignIn layout="header" clientId={clientId} onSuccess={handleGoogleSuccess} />
          </div>
        </div>
      </header>

      <main>
        <section className="relative px-6 sm:px-8 py-16 sm:py-24 max-w-7xl mx-auto overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 z-10">
              <h1 className="text-5xl sm:text-6xl md:text-8xl font-headline italic font-bold leading-tight text-on-surface mb-8">
                The soul of a <br />
                <span className="text-primary">pattern</span>, translated.
              </h1>
              <p className="text-lg sm:text-xl text-on-surface-variant max-w-lg mb-10 leading-relaxed">
                Bridge the gap between international patterns and your needles. StitchSpeak preserves the heritage of craft through intelligent translation and digital journaling.
              </p>
              <div className="flex flex-wrap gap-4">
                <button
                  type="button"
                  onClick={() => setView('translate')}
                  className="px-8 py-4 bg-primary text-on-primary rounded-xl font-semibold text-lg shadow-ambient hover:bg-primary-container transition-all"
                >
                  Start Your First Project
                </button>
                <button
                  type="button"
                  onClick={() => scrollToId('community')}
                  className="px-8 py-4 bg-secondary-container text-on-secondary-container rounded-xl font-semibold text-lg hover:opacity-90 transition-all"
                >
                  Explore Community
                </button>
              </div>
              <div className="mt-6 sm:hidden">
                <LandingGoogleSignIn layout="hero" clientId={clientId} onSuccess={handleGoogleSuccess} />
              </div>
            </div>
            <div className="lg:col-span-5 relative">
              <div className="aspect-[4/5] rounded-[2rem] overflow-hidden shadow-ambient rotate-3 hover:rotate-0 transition-transform duration-700 bg-surface-container max-w-md mx-auto lg:max-w-none">
                <img
                  className="w-full h-full object-cover"
                  alt=""
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuBKjpz8e8CWhwuwK3UBS6aDNv--m1kBuSJO0NF7uDVdoKgDLaOKP1TzJPH8K40-fZfKJUmlmvFvgqXemcq4Lh4w7EfZIPJ_GE2WeHqnCFLyMKCboUGF5v7UPtKBIbHHghUnmx3_Ki8SHJ6GFI9T8b4eQvBt7X7dUn8i1A67AAEn6eZ95S4OkDRfhbKTT8RsCoSyKZ6MpgwqRw4VBO7QsAkg_tCw4RFSIKPvls_w0FJqfgMHTjPFiAdDHNH_4K-HkdYNXpmKSfVPsm0"
                />
              </div>
              <div className="absolute -bottom-8 -left-4 sm:-left-8 p-6 bg-surface/60 glass-nav rounded-xl shadow-ambient max-w-[200px]">
                <Icon name="auto_awesome" className="text-primary mb-2 text-2xl" />
                <p className="text-sm font-medium text-on-surface">
                  Convert any crochet or knitting pattern to a different language.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 sm:px-8 py-16 sm:py-24 bg-surface-container-low">
          <div className="max-w-7xl mx-auto">
            <div className="mb-16">
              <h2 className="text-3xl sm:text-4xl font-headline font-bold mb-4">Crafted for the Modern Maker</h2>
              <p className="text-on-surface-variant">Where tradition meets technological precision.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 bg-surface p-8 rounded-xl flex flex-col justify-between min-h-[320px] sm:min-h-[400px]">
                <div>
                  <Icon name="translate" className="text-primary text-4xl mb-6" />
                  <h3 className="text-2xl sm:text-3xl font-headline font-bold mb-4">Precision Translation Engine</h3>
                  <p className="text-on-surface-variant max-w-md">
                    Our neural network understands the nuances of &quot;yarn overs&quot; and &quot;slip-stitch-pass-overs&quot; across 13 languages.
                  </p>
                </div>
                <div className="mt-8 flex flex-wrap gap-2">
                  <span className="px-4 py-1 bg-tertiary-fixed text-on-tertiary-fixed rounded-full text-xs font-bold uppercase tracking-widest">
                    Japanese to English
                  </span>
                  <span className="px-4 py-1 bg-tertiary-fixed text-on-tertiary-fixed rounded-full text-xs font-bold uppercase tracking-widest">
                    German to US
                  </span>
                </div>
              </div>
              <div
                id="journal"
                className="bg-primary-container p-8 rounded-xl text-on-primary-container flex flex-col justify-center text-center scroll-mt-28"
              >
                <div className="mb-6 mx-auto w-24 h-24 bg-primary rounded-full flex items-center justify-center shadow-ambient">
                  <Icon name="history_edu" className="text-4xl text-on-primary" />
                </div>
                <h3 className="text-2xl font-headline font-bold mb-2">Digital Stitch Journal</h3>
                <p className="opacity-80">Document every skein and swatching session in a tactile digital interface.</p>
              </div>
              <div className="bg-surface-container-highest p-8 rounded-xl flex flex-col items-center justify-center text-center">
                <h3 className="text-lg sm:text-xl font-headline font-bold mb-4 italic">
                  &quot;The clarity of these translated patterns is like having a master knitter sitting right beside you.&quot;
                </h3>
                <p className="text-sm font-label text-on-surface-variant">— Eleanor R., Fiber Artist</p>
              </div>
              <div id="community" className="md:col-span-2 relative h-[260px] sm:h-[300px] rounded-xl overflow-hidden group scroll-mt-28">
                <img
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  alt=""
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDhYed6LmejxktNgT_fctJwoEujKVVdYCPK5oVVhQ6EM9rcUYal7_6OiqxwZS36BKlcmdbWKxwE2qzov-8hH0Tdb1amGT0rE0owGFLUOBfB5L0nPYzN8Ugh9ZhKe1yjftxmq2KlzNgkfo1v0V39iBOdPfAm225iUjTCQNUt7b6m9GYyDq48ZFcBlRcB_zFkTkMZvzOOdWZsZa97Ah5qVRZa8gJD7PtNFJeMs3zgo1VUgYCGjlz6beVQSB6z3mHGs4IatFLUts3I5Mo"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 sm:px-8 py-16 sm:py-24 max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
            <div className="lg:col-span-4 lg:sticky lg:top-28">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-primary mb-4">Pattern playground</p>
              <h2 className="text-3xl sm:text-5xl font-headline font-bold italic leading-tight mb-5">
                Test the feel before you upload.
              </h2>
              <p className="text-on-surface-variant leading-relaxed mb-8">
                Pick a sample, choose any app language, and see how StitchSpeak keeps the craft structure intact.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                {PATTERN_SAMPLES.map((sample) => {
                  const isSelected = sample.id === selectedSample.id;
                  return (
                    <button
                      key={sample.id}
                      type="button"
                      onClick={() => setSelectedSampleId(sample.id)}
                      className={`group text-left rounded-2xl p-4 border transition-all ${
                        isSelected
                          ? 'bg-primary text-on-primary border-primary shadow-ambient'
                          : 'bg-surface border-outline-variant/25 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-ambient'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                            isSelected ? 'bg-on-primary/15' : 'bg-primary-fixed text-on-primary-fixed'
                          }`}
                        >
                          <Icon name={sample.icon} className="text-2xl" />
                        </span>
                        <span>
                          <span className="block font-headline text-lg font-bold">{sample.title}</span>
                          <span className={`mt-1 block text-sm leading-relaxed ${isSelected ? 'text-on-primary/80' : 'text-on-surface-variant'}`}>
                            {sample.subtitle}
                          </span>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-8">
              <div className={`relative overflow-hidden rounded-[2rem] bg-gradient-to-br ${selectedSample.accent} p-1 shadow-ambient`}>
                <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-surface/50 blur-3xl" aria-hidden />
                <div className="absolute -bottom-24 left-10 h-48 w-48 rounded-full bg-secondary-container/50 blur-3xl" aria-hidden />
                <div className="relative rounded-[1.75rem] bg-surface/80 glass-panel border border-white/40 p-5 sm:p-8">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between mb-6">
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-full bg-surface-container-low px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary mb-3">
                        <Icon name="auto_awesome" className="text-base" />
                        Static preview
                      </div>
                      <h3 className="text-2xl sm:text-3xl font-headline font-bold">{selectedSample.title}</h3>
                      <p className="text-sm text-on-surface-variant mt-2">
                        Showing {LANGUAGE_FLAGS[selectedLanguage.code]} {selectedLanguage.name}
                      </p>
                    </div>
                    <div className="shrink-0 rounded-2xl bg-[#1a1a1a] px-5 py-3.5 text-left shadow-lg">
                      <p className="font-body text-[0.65rem] font-medium tracking-[0.2em] text-zinc-400">SAMPLE ONLY</p>
                      <p className="mt-0.5 font-headline text-lg font-bold leading-tight text-white">No live AI call</p>
                    </div>
                  </div>

                  <div className="mb-7">
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-on-surface-variant mb-3">
                      Translate into
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                      {LANGUAGES.map((language) => {
                        const isSelected = language.code === selectedLanguage.code;
                        return (
                          <button
                            key={language.code}
                            type="button"
                            onClick={() => setSelectedLanguageCode(language.code)}
                            className={`shrink-0 rounded-full border px-3 py-2 text-sm font-semibold transition-all ${
                              isSelected
                                ? 'border-primary bg-primary text-on-primary shadow-ambient'
                                : 'border-outline-variant/30 bg-surface/80 text-on-surface hover:border-primary/40 hover:bg-primary-fixed'
                            }`}
                            aria-pressed={isSelected}
                          >
                            <span className="mr-2" aria-hidden>
                              {LANGUAGE_FLAGS[language.code]}
                            </span>
                            {language.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                    <div className="rounded-2xl bg-surface-container-lowest/85 border border-outline-variant/20 p-5">
                      <div className="flex items-center justify-between gap-3 mb-4">
                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-on-surface-variant">Original</p>
                        <span className="rounded-full bg-surface-container px-3 py-1 text-xs font-semibold text-on-surface-variant">
                          English
                        </span>
                      </div>
                      <div className="space-y-3 font-mono text-sm leading-relaxed">
                        {selectedSample.source.map((line, index) => (
                          <div key={`${selectedSample.id}-source-${line}`} className="flex gap-3 rounded-xl bg-surface p-3">
                            <span className="text-primary/60">{String(index + 1).padStart(2, '0')}</span>
                            <span>{line}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-on-surface text-background p-5 shadow-ambient">
                      <div className="flex items-center justify-between gap-3 mb-4">
                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-background/65">Translation</p>
                        <span className="rounded-full bg-background/10 px-3 py-1 text-xs font-semibold text-background">
                          {LANGUAGE_FLAGS[selectedLanguage.code]} {selectedLanguage.name}
                        </span>
                      </div>
                      <div className="space-y-3 font-mono text-sm leading-relaxed">
                        {translatedLines.map((line, index) => (
                          <div key={`${selectedSample.id}-${selectedLanguage.code}-${line}`} className="flex gap-3 rounded-xl bg-background/10 p-3">
                            <span className="text-inverse-primary">{String(index + 1).padStart(2, '0')}</span>
                            <span>{line}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 grid grid-cols-3 gap-3 text-center">
                    {[
                      { value: `${LANGUAGES.length}`, label: 'languages' },
                      { value: `${selectedSample.source.length}`, label: 'pattern lines' },
                      { value: '0', label: 'credits used' },
                    ].map((stat) => (
                      <div key={stat.label} className="rounded-2xl bg-surface-container-low/80 p-4">
                        <p className="font-headline text-2xl font-bold text-primary">{stat.value}</p>
                        <p className="text-xs uppercase tracking-widest text-on-surface-variant">{stat.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 sm:px-8 py-16 sm:py-24 max-w-7xl mx-auto">
          <h2 className="text-4xl sm:text-5xl font-headline font-bold text-center mb-16 sm:mb-20 italic">The Journey of a Stitch</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 sm:gap-16">
            {[
              {
                n: '1',
                icon: 'upload_file',
                title: 'Upload Pattern',
                desc: 'Upload your knitting or crochet pattern as a PDF. Source language is auto-detected so you can move faster.',
              },
              {
                n: '2',
                icon: 'psychology',
                title: 'AI Interpretation',
                desc: 'Our engine parses abbreviations and charts specific to local knitting cultures.',
              },
              {
                n: '3',
                icon: 'check_circle',
                title: 'Cast On',
                desc: 'Get your translated pattern back with the layout untouched — clean, readable, and ready to use.',
              },
            ].map(({ n, icon, title, desc }) => (
              <div key={n} className="text-center relative pt-8">
                <div className="text-[8rem] sm:text-[12rem] font-headline font-black text-surface-container absolute -top-4 sm:-top-24 left-1/2 -translate-x-1/2 -z-10 opacity-50 pointer-events-none select-none">
                  {n}
                </div>
                <div className="mb-6 inline-block p-4 bg-surface-container-high rounded-full relative">
                  <Icon name={icon} className="text-primary text-3xl" />
                </div>
                <h4 className="text-2xl font-headline font-bold mb-4">{title}</h4>
                <p className="text-on-surface-variant">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="px-6 sm:px-8 py-16 sm:py-24 bg-surface-container-high">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-3xl sm:text-4xl font-headline font-bold mb-4">Choose Your Pace</h2>
              <p className="text-on-surface-variant">Buy credits — the more you buy, the less you pay per page. Credits never expire.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {CREDIT_PACKAGES.map((pack, idx) => {
                const perCredit = pack.price / pack.credits;
                const isBest = idx === CREDIT_PACKAGES.length - 1;
                return (
                  <div
                    key={pack.credits}
                    className={`relative bg-surface p-8 rounded-xl shadow-ambient flex flex-col justify-between text-center ${
                      isBest ? 'ring-2 ring-primary lg:scale-105 z-10' : 'border border-outline-variant/20'
                    }`}
                  >
                    {isBest && (
                      <div className="absolute top-0 right-0 bg-secondary-container text-on-secondary-container px-4 py-2 rounded-bl-xl text-xs font-bold uppercase tracking-widest">
                        Best value
                      </div>
                    )}
                    <div>
                      <p className="text-3xl font-headline font-bold text-on-surface">{pack.credits}</p>
                      <p className="text-sm text-on-surface-variant mb-4">credits</p>
                      <p className="text-2xl font-bold text-primary">${pack.price.toFixed(2)}</p>
                      <p className="text-xs text-on-surface-variant mt-2">${perCredit.toFixed(2)} per credit</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openCreditPurchaseFlow(idx)}
                      className={`mt-8 w-full py-3 rounded-xl font-semibold transition-all ${
                        isBest
                          ? 'bg-primary text-on-primary hover:opacity-90'
                          : 'border border-outline-variant/30 hover:bg-surface-container'
                      }`}
                    >
                      {isBest ? 'Go Pro' : 'Get Started'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="px-6 sm:px-8 py-16 sm:py-24 max-w-3xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-headline font-bold mb-10 sm:mb-12 text-center">Questions &amp; Answers</h2>
          <div className="space-y-4">
            {[
              {
                q: 'Will abbreviations like SSK or YO be correct?',
                a: 'Yes. The system is trained specifically on knitting patterns.',
              },
              {
                q: 'Can I keep my original layout and logo?',
                a: '100%. We only translate the text.',
              },
              {
                q: 'Is my pattern private?',
                a: 'Absolutely. Your files are never shared or used for training.',
              },
            ].map(({ q, a }) => (
              <details key={q} className="group bg-surface-container-low rounded-xl">
                <summary className="flex justify-between items-center p-6 cursor-pointer font-medium list-none">
                  <span>{q}</span>
                  <Icon name="expand_more" className="transition-transform group-open:rotate-180 shrink-0" />
                </summary>
                <div className="px-6 pb-6 pt-0 text-on-surface-variant leading-relaxed">{a}</div>
              </details>
            ))}
          </div>
        </section>

        <section className="px-6 sm:px-8 py-16 sm:py-20">
          <div className="max-w-7xl mx-auto bg-tertiary-container rounded-[2.5rem] p-8 sm:p-12 md:p-24 text-center text-on-tertiary-container relative overflow-hidden">
            <div className="relative z-10">
              <h2 className="text-3xl sm:text-4xl md:text-6xl font-headline font-bold italic mb-6">Woven with love, sent weekly.</h2>
              <p className="text-lg opacity-90 mb-10 max-w-xl mx-auto">
                Get curated patterns, yarn guides, and craft stories delivered to your inbox.
              </p>
              <form
                className="flex flex-col md:flex-row gap-4 max-w-md mx-auto"
                onSubmit={(e) => {
                  e.preventDefault();
                }}
              >
                <input
                  className="flex-1 px-6 py-4 rounded-xl bg-surface/20 border-none placeholder:text-on-tertiary-container/60 focus:ring-2 focus:ring-on-tertiary-container text-on-tertiary-container"
                  placeholder="Enter your email"
                  type="email"
                  name="email"
                  autoComplete="email"
                />
                <button
                  type="submit"
                  className="px-8 py-4 bg-on-tertiary-container text-tertiary-container font-bold rounded-xl hover:opacity-90 transition-all"
                >
                  Subscribe
                </button>
              </form>
            </div>
            <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-tertiary rounded-full opacity-20 blur-3xl pointer-events-none" aria-hidden />
          </div>
        </section>
      </main>

      {showCreditPurchaseModal && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="credit-purchase-signin-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-inverse-surface/50 backdrop-blur-sm border-0 cursor-default p-0"
            onClick={closeCreditPurchaseModal}
            aria-label="Close dialog"
          />
          <div className="relative z-10 w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-surface p-6 sm:p-8 shadow-2xl border border-outline-variant/20">
            <div className="flex justify-between items-start gap-4 mb-6">
              <h2 id="credit-purchase-signin-title" className="text-xl font-headline font-bold text-on-surface pr-2">
                Sign in to buy credits
              </h2>
              <button
                type="button"
                onClick={closeCreditPurchaseModal}
                className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors shrink-0"
                aria-label="Close"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">
              Continue with Google to open checkout. The credit pack you chose will be selected for you.
            </p>
            <div className="flex justify-center">
              <LandingGoogleSignIn layout="modal" clientId={clientId} onSuccess={handleGoogleSuccess} />
            </div>
            {!clientId && (
              <p className="text-sm text-error mt-4 text-center">Google sign-in is not configured.</p>
            )}
          </div>
        </div>
      )}

      <footer className="bg-background dark:bg-on-surface border-t border-outline-variant/15 py-12">
        <div className="flex flex-col md:flex-row justify-between items-center px-6 sm:px-8 max-w-7xl mx-auto gap-6">
          <div className="flex flex-col gap-2 text-center md:text-left">
            <div className="font-headline text-xl font-semibold text-on-surface dark:text-background">StitchSpeak</div>
            <p className="font-body text-sm tracking-wide text-on-surface-variant/60 dark:text-background/60">
              © {new Date().getFullYear()} StitchSpeak. Crafted for the modern maker.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-6 sm:gap-8">
            {['Privacy Policy', 'Terms of Service', 'Accessibility', 'Support'].map((label) => (
              <a
                key={label}
                href="#"
                className="font-body text-sm tracking-wide text-on-surface-variant/60 hover:text-on-surface dark:hover:text-background transition-all"
                onClick={(e) => e.preventDefault()}
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      </footer>

      <div className="fixed bottom-8 right-8 z-50 group">
        <button
          type="button"
          onClick={() => setView('translate')}
          className="bg-surface/60 glass-nav shadow-ambient w-16 h-16 rounded-full flex items-center justify-center text-primary hover:bg-primary hover:text-on-primary transition-all duration-300"
          aria-label="Open translator"
        >
          <Icon name="counter_1" className="text-3xl" />
        </button>
        <div className="absolute bottom-full right-0 mb-4 bg-surface p-4 rounded-xl shadow-ambient opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap pointer-events-none">
          <p className="text-xs font-bold text-on-surface-variant uppercase tracking-tighter">Try it</p>
          <p className="font-headline font-bold text-on-surface">Translate a pattern</p>
          <p className="text-sm text-on-surface-variant">Upload PDF — first page free</p>
        </div>
      </div>
    </div>
  );
};
