import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { downloadBlob } from '../storage/storage';
import type { PdfModel, PdfSpells } from './sheetModel';

/**
 * Draws the character sheet as an A4 PDF. The layout follows the classic 5e sheet
 * (abilities, saves and skills on the left; combat in the middle; features on the right),
 * drawn from scratch with the standard PDF fonts so nothing has to be embedded.
 */

const W = 595.28;
const H = 841.89;
const M = 24;
const INK = rgb(0, 0, 0);
const GREY = rgb(0.42, 0.42, 0.42);
const RULE = rgb(0.7, 0.7, 0.7);
const BAND = rgb(0.92, 0.92, 0.92);

interface Fonts {
  body: PDFFont;
  bold: PDFFont;
  title: PDFFont;
}

const mod = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** Characters the standard fonts can't encode are swapped for close ASCII or dropped. */
const REPLACE: Record<string, string> = { '●': '', '○': '', '◆': '', '☐': '', '−': '-', ' ': ' ', '\t': ' ', '\n': ' ', '\r': '' };
const encodable = new Map<string, boolean>();
export function pdfText(font: PDFFont, text: string): string {
  let out = '';
  for (const ch of text) {
    const r = REPLACE[ch];
    if (r !== undefined) {
      out += r;
      continue;
    }
    let ok = encodable.get(ch);
    if (ok === undefined) {
      try {
        font.encodeText(ch);
        ok = true;
      } catch {
        ok = false;
      }
      encodable.set(ch, ok);
    }
    if (ok) out += ch;
  }
  return out;
}

function wrap(font: PDFFont, size: number, text: string, width: number): string[] {
  const words = pdfText(font, text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (let word of words) {
    // Break words longer than the line.
    while (font.widthOfTextAtSize(word, size) > width && word.length > 1) {
      let i = word.length - 1;
      while (i > 1 && font.widthOfTextAtSize(word.slice(0, i), size) > width) i--;
      if (line) {
        lines.push(line);
        line = '';
      }
      lines.push(word.slice(0, i));
      word = word.slice(i);
    }
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) line = next;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Shrinks text to fit a width, then cuts it with an ellipsis as a last resort. */
function fit(font: PDFFont, text: string, size: number, width: number, min = 6): { text: string; size: number } {
  let t = pdfText(font, text);
  let s = size;
  while (s > min && font.widthOfTextAtSize(t, s) > width) s -= 0.25;
  if (font.widthOfTextAtSize(t, s) > width) {
    while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, s) > width) t = t.slice(0, -1);
    t = `${t.trimEnd()}…`;
  }
  return { text: t, size: s };
}

function roundedRect(w: number, h: number, r: number) {
  return `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
}

class Painter {
  constructor(
    public page: PDFPage,
    public f: Fonts,
  ) {}

  /** Box with its top-left corner at (x, top). */
  box(x: number, top: number, w: number, h: number, opts: { label?: string; fill?: boolean; weight?: number; radius?: number } = {}) {
    this.page.drawSvgPath(roundedRect(w, h, opts.radius ?? 5), {
      x,
      y: top,
      borderColor: INK,
      borderWidth: opts.weight ?? 0.9,
      color: opts.fill ? BAND : undefined,
    });
    if (opts.label) this.label(opts.label, x + w / 2, top - h + 4, 'center');
  }

  label(text: string, x: number, y: number, align: 'left' | 'center' | 'right' = 'left', size = 6.2) {
    this.text(text.toUpperCase(), x, y, { font: this.f.bold, size, align });
  }

  text(text: string, x: number, y: number, o: { font?: PDFFont; size?: number; align?: 'left' | 'center' | 'right'; width?: number; color?: ReturnType<typeof rgb> } = {}) {
    const font = o.font ?? this.f.body;
    let size = o.size ?? 8;
    let t = pdfText(font, text);
    if (o.width) ({ text: t, size } = fit(font, t, size, o.width));
    if (!t) return;
    const w = font.widthOfTextAtSize(t, size);
    const dx = o.align === 'center' ? -w / 2 : o.align === 'right' ? -w : 0;
    this.page.drawText(t, { x: x + dx, y, size, font, color: o.color ?? INK });
  }

  circle(cx: number, cy: number, r: number, filled = false) {
    this.page.drawCircle({ x: cx, y: cy, size: r, borderColor: INK, borderWidth: 0.7, color: filled ? INK : undefined });
  }

  diamond(cx: number, cy: number, r: number) {
    this.page.drawSvgPath(`M 0 ${-r} L ${r} 0 L 0 ${r} L ${-r} 0 Z`, { x: cx, y: cy, color: INK });
  }

  line(x1: number, y1: number, x2: number, y2: number, color = RULE, thickness = 0.5) {
    this.page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color });
  }

  /** Proficiency marker: empty circle, filled circle, or diamond for expertise. */
  prof(cx: number, cy: number, proficient: boolean, expertise = false) {
    if (expertise) {
      this.circle(cx, cy, 2.8);
      this.diamond(cx, cy, 2.2);
    } else this.circle(cx, cy, 2.8, proficient);
  }

  footer(ruleset: string, n: number) {
    this.text(`Character Forge · ${ruleset} rules`, M, 14, { size: 6.5, color: GREY });
    this.text(`${n}`, W - M, 14, { size: 6.5, color: GREY, align: 'right' });
  }
}

function header(p: Painter, name: string, cells: [string, string][]) {
  const top = H - M;
  // Name banner.
  p.box(M, top, 200, 46, { fill: true });
  p.text(name, M + 10, top - 26, { font: p.f.title, size: 20, width: 180 });
  p.label('Character name', M + 10, top - 40);
  // Detail grid.
  const x0 = M + 208;
  const w = W - M - x0;
  p.box(x0, top, w, 46);
  const cw = (w - 16) / 3;
  cells.forEach(([lab, val], i) => {
    const cx = x0 + 8 + (i % 3) * cw;
    const base = top - (i < 3 ? 15 : 37);
    p.text(val, cx, base, { size: 8.5, width: cw - 8 });
    p.line(cx, base - 2.5, cx + cw - 8, base - 2.5);
    p.text(lab.toUpperCase(), cx, base - 8, { font: p.f.bold, size: 5.5, color: GREY });
  });
}

/** Writes lines top-down inside a box, shrinking the font when they don't fit. Returns lines not shown. */
function listInBox(p: Painter, items: string[], x: number, top: number, w: number, h: number, opts: { size?: number; bullet?: boolean } = {}) {
  let size = opts.size ?? 8;
  const bottom = top - h;
  const layout = (s: number) => items.map((t) => wrap(p.f.body, s, t, w - (opts.bullet ? 7 : 0)));
  let wrapped = layout(size);
  const height = (ls: string[][], s: number) => ls.reduce((n, l) => n + l.length * s * 1.22 + 1.2, 0);
  while (size > 6 && height(wrapped, size) > h) {
    size -= 0.25;
    wrapped = layout(size);
  }
  const lh = size * 1.22;
  let y = top - size;
  for (let i = 0; i < wrapped.length; i++) {
    const lines = wrapped[i];
    const last = i === wrapped.length - 1;
    // The item's last baseline must sit inside the box, leaving a line for "+ N more" unless it is the last item.
    const lastBaseline = y - (lines.length - 1) * lh;
    if (lastBaseline < bottom + 2 || (!last && lastBaseline - lh - 1.2 < bottom + 2)) {
      p.text(`+ ${wrapped.length - i} more`, x, y, { size, color: GREY });
      return wrapped.length - i;
    }
    if (opts.bullet) p.circle(x + 1.8, y + size * 0.32, 1.1, true);
    for (const l of lines) {
      p.text(l, x + (opts.bullet ? 7 : 0), y, { size });
      y -= lh;
    }
    y -= 1.2;
  }
  return 0;
}

function mainPage(doc: PDFDocument, f: Fonts, m: PdfModel, pageNo: number) {
  const p = new Painter(doc.addPage([W, H]), f);
  header(p, m.name, [
    ['Class & level', m.header.classLevel],
    ['Background', m.header.background],
    ['Player name', ''],
    ['Species', m.header.species],
    ['Alignment', m.header.alignment],
    ['Rules', `${m.ruleset}`],
  ]);

  const top = H - M - 56;

  // ── Column A: abilities | inspiration, proficiency, saves, skills.
  const ax = M;
  const abW = 56;
  const abH = 62;
  const abGap = 5.4;
  m.abilities.forEach((a, i) => {
    const t = top - i * (abH + abGap);
    p.box(ax, t, abW, abH);
    p.text(a.name.toUpperCase(), ax + abW / 2, t - 9, { font: f.bold, size: 5.8, align: 'center', width: abW - 6 });
    p.text(mod(a.mod), ax + abW / 2, t - 34, { font: f.bold, size: 19, align: 'center' });
    p.page.drawEllipse({ x: ax + abW / 2, y: t - abH + 9, xScale: 13, yScale: 7, borderColor: INK, borderWidth: 0.8, color: rgb(1, 1, 1) });
    p.text(`${a.score}`, ax + abW / 2, t - abH + 6.2, { font: f.bold, size: 8.5, align: 'center' });
  });
  const colABottom = top - 6 * abH - 5 * abGap;

  const sx = ax + abW + 6;
  const colW = 202;
  const sw = colW - abW - 6;
  let y = top;
  p.box(sx, y, sw, 22);
  p.circle(sx + 11, y - 11, 6);
  p.label('Inspiration', sx + 24, y - 13.5);
  y -= 26;
  p.box(sx, y, sw, 22);
  p.text(mod(m.profBonus), sx + 11, y - 15, { font: f.bold, size: 10, align: 'center' });
  p.label('Proficiency bonus', sx + 24, y - 13.5);
  y -= 26;

  const row = 12.6;
  const savesH = 6 * row + 16;
  p.box(sx, y, sw, savesH, { label: 'Saving throws' });
  m.abilities.forEach((a, i) => {
    const ly = y - 11 - i * row;
    p.prof(sx + 9, ly + 2.6, a.saveProf);
    p.text(mod(a.save), sx + 27, ly, { font: f.bold, size: 8, align: 'right' });
    p.line(sx + 15, ly - 2, sx + 29, ly - 2);
    p.text(a.name, sx + 33, ly, { size: 7.8 });
  });
  y -= savesH + 4;

  const skillsH = y - colABottom;
  p.box(sx, y, sw, skillsH, { label: 'Skills' });
  const skRow = Math.min(row, (skillsH - 16) / Math.max(1, m.skills.length));
  m.skills.forEach((k, i) => {
    const ly = y - 11 - i * skRow;
    p.prof(sx + 9, ly + 2.6, k.proficient, k.expertise);
    p.text(mod(k.bonus), sx + 27, ly, { font: f.bold, size: 8, align: 'right' });
    p.line(sx + 15, ly - 2, sx + 29, ly - 2);
    const nameFit = fit(f.body, k.name, 7.6, sw - 58);
    p.text(nameFit.text, sx + 33, ly, { size: nameFit.size });
    p.text(`(${k.ability})`, sx + sw - 5, ly, { size: 6.2, color: GREY, align: 'right' });
  });

  y = colABottom - 6;
  p.box(ax, y, colW, 22);
  p.circle(ax + 13, y - 11, 8);
  p.text(`${m.passivePerception}`, ax + 13, y - 14, { font: f.bold, size: 9, align: 'center' });
  p.label('Passive Wisdom (Perception)', ax + 28, y - 13.5);
  y -= 28;

  const profH = y - (M + 6);
  p.box(ax, y, colW, profH, { label: 'Other proficiencies & languages' });
  listInBox(
    p,
    [...m.proficiencies.map((x) => `${x.label}: ${x.text}`), ...(m.extras ? [m.extras] : [])],
    ax + 8,
    y - 6,
    colW - 16,
    profH - 18,
  );

  // ── Column B: combat, attacks, equipment.
  const bx = M + colW + 8;
  const bw = 186;
  y = top;
  const third = (bw - 8) / 3;
  (
    [
      ['Armor class', `${m.ac}`],
      ['Initiative', mod(m.initiative)],
      ['Speed', `${m.speed}`],
    ] as const
  ).forEach(([lab, val], i) => {
    const x = bx + i * (third + 4);
    p.box(x, y, third, 50, { label: lab });
    p.text(val, x + third / 2, y - 30, { font: f.bold, size: 18, align: 'center' });
  });
  y -= 56;

  p.box(bx, y, bw, 62, { label: 'Current hit points' });
  p.text('Hit point maximum', bx + 8, y - 12, { size: 6.5, color: GREY });
  p.text(`${m.maxHp}`, bx + 74, y - 12.5, { font: f.bold, size: 9 });
  p.line(bx + 70, y - 15, bx + bw - 8, y - 15);
  y -= 66;
  p.box(bx, y, bw, 40, { label: 'Temporary hit points' });
  y -= 44;

  const half = (bw - 6) / 2;
  p.box(bx, y, half, 46, { label: 'Hit dice' });
  p.text('Total', bx + 6, y - 11, { size: 6.5, color: GREY });
  p.text(m.hitDice, bx + 26, y - 11.5, { font: f.bold, size: 8, width: half - 32 });
  p.line(bx + 24, y - 14, bx + half - 6, y - 14);
  const dx = bx + half + 6;
  p.box(dx, y, half, 46, { label: 'Death saves' });
  (['Successes', 'Failures'] as const).forEach((lab, i) => {
    const ly = y - 14 - i * 12;
    p.text(lab.toUpperCase(), dx + 5, ly - 2.2, { font: f.bold, size: 5.2 });
    for (let j = 0; j < 3; j++) p.circle(dx + 49 + j * 11, ly + 0.2, 3.6);
  });
  y -= 50;

  const atkH = 236;
  p.box(bx, y, bw, atkH, { label: 'Attacks & spellcasting' });
  const nameW = 80;
  const hitW = 32;
  p.text('NAME', bx + 7, y - 11, { font: f.bold, size: 5.5, color: GREY });
  p.text('ATK BONUS', bx + 7 + nameW + hitW / 2, y - 11, { font: f.bold, size: 5.5, color: GREY, align: 'center' });
  p.text('DAMAGE/TYPE', bx + 7 + nameW + hitW + 6, y - 11, { font: f.bold, size: 5.5, color: GREY });
  let ay = y - 23;
  const atkBottom = y - atkH + 16;
  const atkRows = m.attacks.length ? m.attacks : [];
  let shown = 0;
  for (const a of atkRows) {
    if (ay < atkBottom + 30) break;
    p.page.drawRectangle({ x: bx + 6, y: ay - 3.5, width: nameW - 3, height: 12, color: BAND });
    p.page.drawRectangle({ x: bx + 6 + nameW, y: ay - 3.5, width: hitW - 2, height: 12, color: BAND });
    p.page.drawRectangle({ x: bx + 6 + nameW + hitW + 2, y: ay - 3.5, width: bw - nameW - hitW - 14, height: 12, color: BAND });
    p.text(a.name, bx + 9, ay, { size: 7.6, width: nameW - 8 });
    p.text(mod(a.bonus), bx + 6 + nameW + (hitW - 2) / 2, ay, { font: f.bold, size: 8, align: 'center' });
    p.text(a.damage, bx + nameW + hitW + 11, ay, { size: 7.4, width: bw - nameW - hitW - 20 });
    ay -= 15;
    shown++;
  }
  // Blank rows to fill in by hand, then the spellcasting summary.
  while (shown < 3) {
    p.page.drawRectangle({ x: bx + 6, y: ay - 3.5, width: nameW - 3, height: 12, color: BAND });
    p.page.drawRectangle({ x: bx + 6 + nameW, y: ay - 3.5, width: hitW - 2, height: 12, color: BAND });
    p.page.drawRectangle({ x: bx + 6 + nameW + hitW + 2, y: ay - 3.5, width: bw - nameW - hitW - 14, height: 12, color: BAND });
    ay -= 15;
    shown++;
  }
  if (m.attacks.length > shown) p.text(`+ ${m.attacks.length - shown} more attacks`, bx + 8, (ay -= 2), { size: 7, color: GREY });
  if (m.spells) {
    const lines = m.spells.casters.map((k) => `${k.name}: spell save DC ${k.saveDc}, spell attack ${mod(k.attack)} (${k.ability})`);
    lines.push('Spells: see the spellcasting page.');
    listInBox(p, lines, bx + 8, ay - 4, bw - 16, ay - 4 - atkBottom);
  }
  y -= atkH + 4;

  const eqH = y - (M + 6);
  p.box(bx, y, bw, eqH, { label: 'Equipment' });
  const coins = ['cp', 'sp', 'ep', 'gp', 'pp'] as const;
  const coinH = Math.min(30, (eqH - 24) / 5);
  coins.forEach((k, i) => {
    const cy = y - 8 - i * (coinH + 2);
    p.box(bx + 6, cy, 40, coinH, { radius: 3, weight: 0.7 });
    p.text(k.toUpperCase(), bx + 10, cy - 8, { font: f.bold, size: 5.5, color: GREY });
    p.text(`${m.coins[k] || ''}`, bx + 26, cy - coinH / 2 - 5, { font: f.bold, size: 9, align: 'center', width: 36 });
  });
  listInBox(p, m.equipment.length ? m.equipment : ['—'], bx + 52, y - 8, bw - 60, eqH - 22, { bullet: true });

  // ── Column C: personality and feature titles.
  const cx = bx + bw + 8;
  const cw = W - M - cx;
  y = top;
  const persH = 96;
  p.box(cx, y, cw, persH, { label: 'Personality traits' });
  if (m.personality) listInBox(p, [m.personality], cx + 8, y - 6, cw - 16, persH - 20, { size: 7.5 });
  y -= persH + 4;
  const featH = y - (M + 6);
  p.box(cx, y, cw, featH, { label: 'Features & traits' });
  listInBox(p, m.features.length ? m.features : ['—'], cx + 8, y - 6, cw - 16, featH - 20, { bullet: true, size: 8 });

  p.footer(m.ruleset, pageNo);
}

function spellPage(doc: PDFDocument, f: Fonts, m: PdfModel, sp: PdfSpells, startNo: number) {
  let pageNo = startNo;
  let p = new Painter(doc.addPage([W, H]), f);
  const top = H - M;
  const join = (xs: string[]) => [...new Set(xs)].join(' / ') || '—';

  // Header: casting classes, then ability, save DC and attack bonus.
  p.box(M, top, 200, 46, { fill: true });
  p.text(join(sp.casters.map((k) => k.name)) || m.name, M + 10, top - 26, { font: f.title, size: 16, width: 180 });
  p.label('Spellcasting class', M + 10, top - 40);
  const x0 = M + 208;
  const w = W - M - x0;
  p.box(x0, top, w, 46, { fill: true });
  const cells: [string, string][] = [
    ['Spellcasting ability', join(sp.casters.map((k) => k.ability))],
    ['Spell save DC', join(sp.casters.map((k) => `${k.saveDc}`))],
    ['Spell attack bonus', join(sp.casters.map((k) => mod(k.attack)))],
  ];
  const cw3 = (w - 24) / 3;
  cells.forEach(([lab, val], i) => {
    const cx = x0 + 6 + i * (cw3 + 6);
    p.box(cx, top - 5, cw3, 26, { radius: 7 });
    p.text(val, cx + cw3 / 2, top - 22, { font: f.bold, size: 11, align: 'center', width: cw3 - 8 });
    p.text(lab.toUpperCase(), cx + cw3 / 2, top - 40, { font: f.bold, size: 5.6, align: 'center' });
  });

  // Level blocks flow down three columns.
  const colGap = 8;
  const colW = (W - 2 * M - 2 * colGap) / 3;
  const colTop = top - 58;
  const bottom = M + 8;
  const lineH = 13;
  const headH = 22;
  let col = 0;
  let y = colTop;
  const colX = () => M + col * (colW + colGap);
  const nextColumn = () => {
    col++;
    y = colTop;
    if (col > 2) {
      p.footer(m.ruleset, pageNo++);
      p = new Painter(doc.addPage([W, H]), f);
      col = 0;
      y = top;
    }
  };

  const blockHead = (lvl: number, slots: number, pactNote: string, cont: boolean) => {
    const x = colX();
    p.box(x, y, colW, headH, { fill: true, radius: 6 });
    p.page.drawSvgPath(roundedRect(20, headH, 5), { x, y, color: INK });
    p.text(`${lvl}`, x + 10, y - 15, { font: f.bold, size: 11, align: 'center', color: rgb(1, 1, 1) });
    if (lvl === 0) p.text(cont ? 'CANTRIPS (cont.)' : 'CANTRIPS', x + 26, y - 14, { font: f.bold, size: 7.5 });
    else {
      p.text(cont ? 'cont.' : 'SLOTS', x + 26, y - 9, { font: f.bold, size: 5.2, color: GREY });
      p.text(cont ? '' : `${slots || '—'}`, x + 26, y - 18, { font: f.bold, size: 8.5 });
      if (!cont) {
        const shownSlots = Math.min(slots, 9);
        for (let i = 0; i < shownSlots; i++) p.circle(x + 52 + i * 10, y - headH / 2, 3.6);
        if (pactNote) p.text(pactNote, x + colW - 6, y - 14, { size: 6.5, align: 'right', color: GREY, width: colW - 60 - shownSlots * 10 });
      }
    }
    y -= headH + 6;
  };

  const levels = [...sp.levels];
  if (sp.pact && !levels.some((l) => l.level === sp.pact!.level)) {
    levels.push({ level: sp.pact.level, slots: 0, spells: [] });
    levels.sort((a, b) => a.level - b.level);
  }

  let anyAlways = false;
  for (const lv of levels) {
    const pactNote = sp.pact && sp.pact.level === lv.level ? `Pact slots ${sp.pact.count}` : '';
    // Room for a couple of blank lines to write new spells in.
    const rows: ({ name: string; always: boolean } | null)[] = [...lv.spells, null, null];
    if (y - headH - lineH * Math.min(rows.length, 3) < bottom) nextColumn();
    blockHead(lv.level, lv.slots, pactNote, false);
    for (const r of rows) {
      if (y - lineH < bottom) {
        nextColumn();
        blockHead(lv.level, lv.slots, '', true);
      }
      const x = colX();
      if (lv.level > 0) p.circle(x + 6, y - 6.5, 3, Boolean(r));
      const tx = x + (lv.level > 0 ? 14 : 4);
      if (r) {
        anyAlways ||= r.always;
        p.text(r.always ? `${r.name} *` : r.name, tx, y - 9, { size: 8, width: colW - (tx - x) - 4 });
      }
      p.line(tx, y - 11.5, x + colW - 2, y - 11.5);
      y -= lineH;
    }
    y -= 8;
  }
  if (anyAlways) p.text('* always prepared', W - M - 16, 14, { size: 6.5, color: GREY, align: 'right' });
  p.footer(m.ruleset, pageNo);
  return pageNo;
}

export async function renderCharacterPdf(m: PdfModel): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${m.name} — character sheet`);
  doc.setCreator('Character Forge');
  doc.setProducer('Character Forge');
  const f: Fonts = {
    body: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    title: await doc.embedFont(StandardFonts.TimesRomanBold),
  };
  mainPage(doc, f, m, 1);
  if (m.spells && m.spells.levels.length) spellPage(doc, f, m, m.spells, 2);
  return doc.save();
}

/** Builds the PDF in the browser and downloads it. */
export async function downloadCharacterPdf(m: PdfModel) {
  const bytes = await renderCharacterPdf(m);
  downloadBlob(`${m.name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'character'}.pdf`, bytes, 'application/pdf');
}
