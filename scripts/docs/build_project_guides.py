"""Build the two screenshot guides from the isolated Playwright capture manifest."""
import io, json, math
from pathlib import Path
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from xml.sax.saxutils import escape

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'artifacts/project-guides'
W,H=landscape(A4)
NAVY=HexColor('#082C61'); BLUE=HexColor('#075CF5'); MUTED=HexColor('#64748B'); TEAL=HexColor('#009F92'); BORDER=HexColor('#DFE8F5'); PALE=HexColor('#F3F7FD')
for name,file in [('UI','segoeui.ttf'),('UIBold','segoeuib.ttf')]:
    target=Path('C:/Windows/Fonts')/file
    pdfmetrics.registerFont(TTFont(name,str(target)))
STYLE=ParagraphStyle('copy',fontName='UI',fontSize=10,leading=15,textColor=MUTED)
SMALL=ParagraphStyle('small',fontName='UI',fontSize=8,leading=12,textColor=MUTED)

def para(c,text,x,y,width,style=STYLE):
    p=Paragraph(escape(text),style); _,height=p.wrap(width,1000);p.drawOn(c,x,y-height);return y-height

def brand(c,x=32,y=None):
    y=y or H-31
    c.setFillColor(NAVY);c.setFont('Times-Roman',18);c.drawString(x,y,'A A GARG & CO')
    c.setStrokeColor(NAVY);c.setLineWidth(.5);c.line(x,y-5,x+164,y-5);c.line(x,y-7,x+164,y-7)
    c.setFont('UI',4.8);c.drawString(x+2,y-15,'THINK BEYOND  |  INNOVATE  |  SIMPLIFY')

def shell(c,phase,number,label):
    c.setFillColor(white);c.rect(0,0,W,H,fill=1,stroke=0);brand(c)
    c.setFont('UIBold',9);c.setFillColor(BLUE);c.drawRightString(W-32,H-31,'ORQIX  /  PHASE '+phase)
    c.setStrokeColor(BORDER);c.line(32,33,W-32,33)
    c.setFont('UI',7);c.setFillColor(MUTED);c.drawString(32,21,'4 November 2026  |  Current implementation  |  Isolated sample-data screenshots')
    c.drawRightString(W-32,21,f'{label}  |  {number:02d}')

def sections(entries):
    result=[]
    for e in entries:
        image=Image.open(OUT/'screenshots'/e['file']).convert('RGB')
        # Every image is preserved; long application pages are divided into readable bands.
        count=1 if image.height <= 1300 else math.ceil(image.height/1000)
        band=math.ceil(image.height/count)
        for i in range(count):
            result.append((e,image.crop((0,i*band,image.width,min(image.height,(i+1)*band))),i+1,count))
    return result

def cover(c,phase,title,subtitle,screen_count):
    c.setFillColor(NAVY);c.rect(0,0,W,H,fill=1,stroke=0)
    c.setFillColor(BLUE);c.circle(W+60,H+60,340,fill=1,stroke=0)
    c.setFillColor(TEAL);c.roundRect(38,H-74,106,27,13,fill=1,stroke=0)
    c.setFillColor(white);c.setFont('UIBold',11);c.drawString(54,H-65,'PHASE '+phase)
    c.setFont('UIBold',41);c.drawString(38,H-155,'ORQIX')
    para(c,title,38,H-182,W-95,ParagraphStyle('title',fontName='UIBold',fontSize=28,leading=36,textColor=white))
    para(c,subtitle,40,H-281,W-125,ParagraphStyle('sub',fontName='UI',fontSize=13,leading=21,textColor=HexColor('#D4E5FF')))
    c.setFillColor(white);c.roundRect(38,88,W-76,73,13,fill=1,stroke=0)
    c.setFillColor(NAVY);c.setFont('UIBold',13);c.drawString(56,135,'A A GARG & CO')
    c.setFillColor(MUTED);c.setFont('UI',10);c.drawString(56,113,f'{screen_count} screens  |  Workflow explanations  |  Page-by-page screenshots')
    c.setFillColor(HexColor('#D4E5FF'));c.setFont('UI',9);c.drawString(40,48,'PROJECT WALKTHROUGH  /  4 NOVEMBER 2026')
    c.showPage()

def workflow(c,phase,num):
    shell(c,phase,num,'Workflow')
    c.setFillColor(NAVY);c.setFont('UIBold',24);c.drawString(32,H-94,'How the platform works')
    if phase=='I':
        rows=[('ADMIN SETUP',['Login & roles','Teams & users','Client allocation','Client organization']),('INTERNAL OPERATIONS',['Assigned client','CPCB login + OTP','Scrape All / Available','Final Excel download']),('CLIENT DELIVERY',['Final Excel upload','Choose client / unit','Publish directly','Client portal updated'])]
        notes=[('Admin responsibilities','Maintain identities, reporting relationships, assignments and organization links. Permissions are enforced by the API.'),('Internal user responsibilities','Work on assigned clients, execute the supported BOT workflow and manage tasks. Upload and deletion modes retain their source-specific inputs and protections.'),('Client consultations','Client questions arrive in Client Consultation Requests. Authorized staff reply and choose In Progress, Awaiting Client or Resolved; the same thread is visible to the client.')]
    else:
        rows=[('DATA ARRIVES',['Internal BOT extract','Final workbook','Staff publication','Client dashboard']),('CLIENT EXPLORATION',['Select company / FY','Explore quantities','Compare summary','Download reports']),('ADVISORY',['Request Consultation','Assigned team inbox','Reply + status','Client follows up'])]
        notes=[('Workbook coverage','Available, Procurement data and Procurement Summary drive current client analytics. Other workbook sheets do not currently contribute to dashboard calculations.'),('Access model','Clients see their organization scope. One organization can contain multiple accounts, units and portal registrations. Clients do not operate the internal BOTs.'),('Current boundaries','Certificate review/action requests are removed. Reconciliation compares available numeric records; it does not present missing-field issue tables. Razorpay test checkout does not prove a live subscription or real payment.')]
    y=H-124
    for label,steps in rows:
        c.setFillColor(MUTED);c.setFont('UIBold',8);c.drawString(34,y,label);y-=35
        for i,text in enumerate(steps):
            x=34+i*198;c.setFillColor(PALE);c.setStrokeColor(BORDER);c.roundRect(x,y,179,31,7,fill=1,stroke=1)
            c.setFillColor(BLUE);c.setFont('UIBold',9);c.drawCentredString(x+89.5,y+12,text)
            if i<3:c.setFont('UIBold',14);c.drawString(x+183,y+10,'>')
        y-=30
    y-=3
    for title,text in notes:
        c.setFillColor(NAVY);c.setFont('UIBold',10);c.drawString(34,y,title);y=para(c,text,34,y-7,W-72,SMALL)-17
    c.showPage()

def build(phase,entries,filename,title,subtitle):
    global H
    H=landscape(A4)[1]
    frames=sections(entries)
    toc_pages=math.ceil(len(entries)/18)
    first_screen=3+toc_pages
    start={};number=first_screen
    for entry,im,part,count in frames:
        start.setdefault(entry['file'],number);number+=1
    target=OUT/filename;c=canvas.Canvas(str(target),pagesize=(W,H),pageCompression=1)
    c.setTitle('ORQIX - Phase '+phase+' - '+title);c.setAuthor('A A GARG & CO');c.setSubject('Current project pages and workflows; isolated documentation environment')
    cover(c,phase,title,subtitle,len(entries));workflow(c,phase,2)
    for k in range(toc_pages):
        shell(c,phase,3+k,'Contents');c.setFillColor(NAVY);c.setFont('UIBold',24);c.drawString(32,H-93,'Page directory'+(' - continued' if k else ''))
        y=H-129
        for e in entries[k*18:(k+1)*18]:
            c.setFillColor(MUTED);c.setFont('UI',8);c.drawString(34,y,e['group'])
            c.setFillColor(NAVY);c.setFont('UIBold',10);c.drawString(165,y,e['title'])
            c.setFillColor(BLUE);c.drawRightString(W-36,y,str(start[e['file']]))
            c.linkAbsolute('',e['file'],(160,y-3,W-32,y+12),thickness=0)
            c.setStrokeColor(BORDER);c.line(34,y-8,W-34,y-8);y-=23
        c.showPage()
    num=first_screen
    for entry,image,part,count in frames:
        H=max(landscape(A4)[1],image.height*(W-74)/image.width+213)
        c.setPageSize((W,H))
        shell(c,phase,num,entry['group']);
        if part==1:c.bookmarkPage(entry['file']);c.addOutlineEntry(entry['group']+' / '+entry['title'],entry['file'],level=0)
        c.setFillColor(MUTED);c.setFont('UIBold',8);c.drawString(32,H-77,entry['group'].upper())
        c.setFillColor(NAVY);c.setFont('UIBold',20);c.drawString(32,H-103,entry['title']+(f' | {part}/{count}' if count>1 else ''))
        para(c,entry['description'],32,H-114,W-64,ParagraphStyle('desc',parent=SMALL,fontSize=9,leading=13))
        c.setFillColor(BLUE);c.setFont('UI',7);c.drawRightString(W-32,H-77,entry['route'])
        box_x,box_y,box_w,box_h=32,49,W-64,H-213
        c.setFillColor(PALE);c.setStrokeColor(BORDER);c.roundRect(box_x,box_y,box_w,box_h,7,fill=1,stroke=1)
        factor=min((box_w-10)/image.width,(box_h-10)/image.height);iw,ih=image.width*factor,image.height*factor
        c.drawImage(ImageReader(image),box_x+(box_w-iw)/2,box_y+box_h-5-ih,width=iw,height=ih)
        c.showPage();num+=1
    c.save();print(f'{filename}: {num-1} pages, {len(entries)} screens, {target.stat().st_size/1048576:.1f} MB')

if __name__=='__main__':
    entries=json.loads((OUT/'manifest.json').read_text())
    order={'Access':0,'Admin':1,'Admin forms':2,'Automation details':3,'Client operations':4,'Internal user':5,'Manager':6,'Client portal':1,'Client workflow':2,'Supporting pages':3}
    entries=sorted(entries,key=lambda e:(e['phase'],order.get(e['group'],9)))
    build('I',[e for e in entries if e['phase']==1],'ORQIX-Phase-I-Admin-and-User-Workflow.pdf','Admin & Internal User Workflows','A complete walkthrough of management setup, employee operations, automation controls, client publishing and consultation handling.')
    build('II',[e for e in entries if e['phase']==2],'ORQIX-Phase-II-Client-Portal.pdf','Client Portal Walkthrough','A page-by-page guide to business dashboards, certificates, procurement, reconciliation, advisory support, reporting and subscription settings.')
