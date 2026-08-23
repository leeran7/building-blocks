/**
 * prisma/seed.ts
 *
 * Seeds active seasons (one per category) and sample blocks per tower.
 * Run via: pnpm db:seed
 */

import { PrismaClient, Category } from "@prisma/client";

const prisma = new PrismaClient();

const BLOCKS_PER_CATEGORY: Record<
  Category,
  Array<{ slug: string; display_name: string; url: string; owner_email: string; altitude: number }>
> = {
  Tech: [
    { slug: "vercel",       display_name: "Vercel",         url: "https://vercel.com",         owner_email: "seed@tower.dev", altitude: 142.5 },
    { slug: "supabase",     display_name: "Supabase",       url: "https://supabase.com",       owner_email: "seed@tower.dev", altitude: 118.2 },
    { slug: "linear-app",   display_name: "Linear",         url: "https://linear.app",         owner_email: "seed@tower.dev", altitude: 97.8  },
    { slug: "raycast-app",  display_name: "Raycast",        url: "https://raycast.com",        owner_email: "seed@tower.dev", altitude: 74.3  },
    { slug: "turso-tech",   display_name: "Turso",          url: "https://turso.tech",         owner_email: "seed@tower.dev", altitude: 55.1  },
    { slug: "fly-io",       display_name: "Fly.io",         url: "https://fly.io",             owner_email: "seed@tower.dev", altitude: 38.6  },
    { slug: "clerk-dev",    display_name: "Clerk",          url: "https://clerk.dev",          owner_email: "seed@tower.dev", altitude: 22.4  },
    { slug: "upstash-io",   display_name: "Upstash",        url: "https://upstash.com",        owner_email: "seed@tower.dev", altitude: 11.7  },
  ],
  Design: [
    { slug: "figma-com",    display_name: "Figma",          url: "https://figma.com",          owner_email: "seed@tower.dev", altitude: 165.0 },
    { slug: "framer-com",   display_name: "Framer",         url: "https://framer.com",         owner_email: "seed@tower.dev", altitude: 134.7 },
    { slug: "spline-design",display_name: "Spline",         url: "https://spline.design",      owner_email: "seed@tower.dev", altitude: 88.2  },
    { slug: "mobbin-design",display_name: "Mobbin",         url: "https://mobbin.com",         owner_email: "seed@tower.dev", altitude: 61.4  },
    { slug: "fontshare-io", display_name: "Fontshare",      url: "https://www.fontshare.com",  owner_email: "seed@tower.dev", altitude: 33.9  },
    { slug: "coolors-co",   display_name: "Coolors",        url: "https://coolors.co",         owner_email: "seed@tower.dev", altitude: 14.2  },
  ],
  Business: [
    { slug: "notion-so",    display_name: "Notion",         url: "https://notion.so",          owner_email: "seed@tower.dev", altitude: 201.3 },
    { slug: "loom-com",     display_name: "Loom",           url: "https://loom.com",           owner_email: "seed@tower.dev", altitude: 154.6 },
    { slug: "cal-com",      display_name: "Cal.com",        url: "https://cal.com",            owner_email: "seed@tower.dev", altitude: 109.8 },
    { slug: "typeform-com", display_name: "Typeform",       url: "https://typeform.com",       owner_email: "seed@tower.dev", altitude: 72.5  },
    { slug: "mercury-co",   display_name: "Mercury",        url: "https://mercury.com",        owner_email: "seed@tower.dev", altitude: 41.3  },
    { slug: "brex-com",     display_name: "Brex",           url: "https://brex.com",           owner_email: "seed@tower.dev", altitude: 18.7  },
  ],
  Creative: [
    { slug: "runway-ml",    display_name: "Runway",         url: "https://runwayml.com",       owner_email: "seed@tower.dev", altitude: 178.4 },
    { slug: "midjourney-com",display_name:"Midjourney",     url: "https://midjourney.com",     owner_email: "seed@tower.dev", altitude: 143.2 },
    { slug: "udio-com",     display_name: "Udio",           url: "https://udio.com",           owner_email: "seed@tower.dev", altitude: 99.7  },
    { slug: "pika-art",     display_name: "Pika",           url: "https://pika.art",           owner_email: "seed@tower.dev", altitude: 67.1  },
    { slug: "krea-ai",      display_name: "Krea",           url: "https://krea.ai",            owner_email: "seed@tower.dev", altitude: 44.8  },
    { slug: "suno-ai",      display_name: "Suno",           url: "https://suno.com",           owner_email: "seed@tower.dev", altitude: 29.3  },
    { slug: "hedra-com",    display_name: "Hedra",          url: "https://hedra.com",          owner_email: "seed@tower.dev", altitude: 12.6  },
  ],
  Gaming: [
    { slug: "itch-io",      display_name: "itch.io",        url: "https://itch.io",            owner_email: "seed@tower.dev", altitude: 187.9 },
    { slug: "godot-engine", display_name: "Godot",          url: "https://godotengine.org",    owner_email: "seed@tower.dev", altitude: 151.3 },
    { slug: "unity-com",    display_name: "Unity",          url: "https://unity.com",          owner_email: "seed@tower.dev", altitude: 116.4 },
    { slug: "gamemaker-io", display_name: "GameMaker",      url: "https://gamemaker.io",       owner_email: "seed@tower.dev", altitude: 78.2  },
    { slug: "bevy-engine",  display_name: "Bevy",           url: "https://bevyengine.org",     owner_email: "seed@tower.dev", altitude: 52.7  },
    { slug: "excaliburzr",  display_name: "Excalibur.js",   url: "https://excaliburjs.com",    owner_email: "seed@tower.dev", altitude: 27.9  },
  ],
  Science: [
    { slug: "huggingface",  display_name: "Hugging Face",   url: "https://huggingface.co",     owner_email: "seed@tower.dev", altitude: 224.1 },
    { slug: "arxiv-org",    display_name: "arXiv",          url: "https://arxiv.org",          owner_email: "seed@tower.dev", altitude: 183.6 },
    { slug: "weights-biases",display_name:"Weights & Biases",url:"https://wandb.ai",           owner_email: "seed@tower.dev", altitude: 138.5 },
    { slug: "replicate-com",display_name: "Replicate",      url: "https://replicate.com",      owner_email: "seed@tower.dev", altitude: 95.2  },
    { slug: "kaggle-com",   display_name: "Kaggle",         url: "https://kaggle.com",         owner_email: "seed@tower.dev", altitude: 61.8  },
    { slug: "paperswithcode",display_name:"Papers with Code",url:"https://paperswithcode.com", owner_email: "seed@tower.dev", altitude: 34.5  },
    { slug: "eleutherai",   display_name: "EleutherAI",     url: "https://eleuther.ai",        owner_email: "seed@tower.dev", altitude: 15.9  },
  ],
};

async function getOrCreateSeason(category: Category): Promise<string> {
  const existing = await prisma.season.findFirst({
    where: { is_active: true, category },
  });
  if (existing) return existing.id;

  const now = new Date();
  const endsAt = new Date(now);
  endsAt.setDate(endsAt.getDate() + 90);

  const season = await prisma.season.create({
    data: { starts_at: now, ends_at: endsAt, is_active: true, views_k: 0, category },
  });
  return season.id;
}

async function main() {
  console.log("Seeding towers...\n");

  for (const [cat, blocks] of Object.entries(BLOCKS_PER_CATEGORY) as [Category, typeof BLOCKS_PER_CATEGORY[Category]][]) {
    const seasonId = await getOrCreateSeason(cat);

    let created = 0;
    let skipped = 0;

    for (const b of blocks) {
      const exists = await prisma.block.findUnique({ where: { slug: b.slug } });
      if (exists) { skipped++; continue; }

      await prisma.block.create({
        data: {
          slug:         b.slug,
          url:          b.url,
          display_name: b.display_name,
          owner_email:  b.owner_email,
          altitude:     b.altitude,
          spend_c:      Math.round(b.altitude * 100),
          views_served: Math.floor(b.altitude * 12),
          clicks:       Math.floor(b.altitude * 1.4),
          season_id:    seasonId,
          category:     cat as Category,
        },
      });
      created++;
    }

    console.log(`  ${cat.padEnd(10)} ${created} created, ${skipped} skipped (season ${seasonId.slice(0, 8)}…)`);
  }

  console.log("\nDone.");
}

main()
  .catch((e) => { console.error("Seed failed:", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
