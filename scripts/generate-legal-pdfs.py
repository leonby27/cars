"""Regenerate the two static legal PDFs from the site's shared editorial source.
Requires Node.js and reportlab. Set LEGAL_PDF_FONT_DIR to a DejaVu font directory.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

ROOT = Path(__file__).resolve().parents[1]
font_candidates = [
    Path(os.environ.get('LEGAL_PDF_FONT_DIR', '/usr/share/fonts/truetype/dejavu')),
    Path.home() / '.cache/codex-runtimes/codex-primary-runtime/dependencies/native/libreoffice-headless/libreoffice/LibreOfficeDev.app/Contents/Resources/fonts/truetype',
]
font_dir = next((p for p in font_candidates if (p / 'DejaVuSans.ttf').exists() and (p / 'DejaVuSans-Bold.ttf').exists()), None)
if font_dir is None:
    raise SystemExit('Set LEGAL_PDF_FONT_DIR to a folder containing DejaVuSans.ttf and DejaVuSans-Bold.ttf')
for name, filename in [('Legal', 'DejaVuSans.ttf'), ('LegalBold', 'DejaVuSans-Bold.ttf')]:
    pdfmetrics.registerFont(TTFont(name, str(font_dir / filename)))
data = json.loads(subprocess.check_output([
    'node', '--input-type=module', '-e',
    "import {LEGAL_COPY,LEGAL_DRAFT,LEGAL_DRAFT_NOTE} from './src/legal-copy.js'; console.log(JSON.stringify({copy:LEGAL_COPY,draft:LEGAL_DRAFT,note:LEGAL_DRAFT_NOTE}));"
], cwd=ROOT, text=True))
styles = {
    'title': ParagraphStyle('title', fontName='LegalBold', fontSize=20, leading=26, spaceAfter=12),
    'meta': ParagraphStyle('meta', fontName='Legal', fontSize=9, leading=13, spaceAfter=12, textColor=colors.HexColor('#555555')),
    'body': ParagraphStyle('body', fontName='Legal', fontSize=10.5, leading=15.5, spaceAfter=8, alignment=TA_LEFT, allowWidows=0, allowOrphans=0),
    'heading': ParagraphStyle('heading', fontName='LegalBold', fontSize=11.5, leading=16, spaceBefore=12, spaceAfter=7, keepWithNext=True),
    'note': ParagraphStyle('note', fontName='Legal', fontSize=9, leading=13, spaceAfter=12, borderPadding=9, backColor=colors.HexColor('#f2f2f2')),
}

def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont('Legal', 8)
    canvas.setFillColor(colors.HexColor('#666666'))
    canvas.drawString(48, 30, 'abcars.by  |  Проект для согласования' if data['draft'] else 'abcars.by')
    canvas.drawRightString(A4[0] - 48, 30, str(doc.page))
    canvas.restoreState()

for kind, filename in [('privacy', 'privacy-policy.pdf'), ('terms', 'terms-of-use.pdf')]:
    content = data['copy'][kind]
    output = ROOT / 'output/pdf' / filename
    output.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(str(output), pagesize=A4, rightMargin=48, leftMargin=48, topMargin=45, bottomMargin=49,
        title=content['title'] + ' | abcars.by', author='abcars.by', subject='Проект для согласования' if data['draft'] else content['title'])
    flow = [Paragraph(escape(content['title']), styles['title']), Paragraph('abcars.by • Редакция от ' + content['updated'], styles['meta'])]
    if data['draft']:
        flow += [Paragraph(escape(data['note']), styles['note']), Spacer(1, 4)]
    flow.append(Paragraph(escape(content['intro']), styles['body']))
    for title, text in content['sections']:
        flow.append(Paragraph(escape(title), styles['heading']))
        flow.extend(Paragraph(escape(p), styles['body']) for p in text.split('\n'))
    doc.build(flow, onFirstPage=footer, onLaterPages=footer)
    public = ROOT / 'public/documents' / filename
    public.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(output, public)
    print(f'{filename}: {output.stat().st_size} bytes')
