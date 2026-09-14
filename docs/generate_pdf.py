import os
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, KeepTogether

def generate_pdf():
    pdf_path = "/Users/dhowlagarrahul/Stuff/Beast Mode/wibby/docs/WIBBY_STORAGE_AND_ENCRYPTION_GUIDE.pdf"
    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40
    )
    
    styles = getSampleStyleSheet()
    
    # Custom styles
    primary_color = colors.HexColor('#6D28D9') # Deep purple
    dark_text = colors.HexColor('#0F172A')
    muted_text = colors.HexColor('#475569')
    bg_light = colors.HexColor('#F8FAFC')
    card_border = colors.HexColor('#E2E8F0')
    code_bg = colors.HexColor('#1E293B')
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=primary_color,
        spaceAfter=6
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=muted_text,
        spaceAfter=15
    )
    
    h2_style = ParagraphStyle(
        'SectionH2',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=17,
        textColor=primary_color,
        spaceBefore=12,
        spaceAfter=6
    )
    
    h3_style = ParagraphStyle(
        'SectionH3',
        parent=styles['Heading3'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=dark_text,
        spaceBefore=8,
        spaceAfter=4
    )
    
    body_style = ParagraphStyle(
        'BodyDark',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13.5,
        textColor=dark_text,
        spaceAfter=5
    )
    
    code_style = ParagraphStyle(
        'CodeSnippet',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=8.5,
        leading=11.5,
        textColor=colors.HexColor('#38BDF8'),
        spaceAfter=0
    )
    
    story = []
    
    # Header
    story.append(Paragraph("Wibby — Storage Cleaning & Encryption Guide", title_style))
    story.append(Paragraph("Technical Runbook: Data Tiers, Encryption Auditing, Safe Storage Cleaning & Architecture", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=primary_color, spaceBefore=0, spaceAfter=12))
    
    # Section 1: Storage Architecture
    story.append(Paragraph("1. Storage Architecture Overview", h2_style))
    story.append(Paragraph("Wibby implements strict 3-tier partitioning to ensure zero data leaks between users:", body_style))
    
    table_data = [
        [Paragraph("<b>Storage Tier</b>", body_style), Paragraph("<b>Technology</b>", body_style), Paragraph("<b>Path / Location</b>", body_style), Paragraph("<b>Contents & Security</b>", body_style)],
        [Paragraph("<b>Database</b>", body_style), Paragraph("MongoDB", body_style), Paragraph("mongodb://localhost:27017/wibby", body_style), Paragraph("User profiles, pairings, message metadata, call logs, 24h stories.", body_style)],
        [Paragraph("<b>Encrypted Media</b>", body_style), Paragraph("Local / OCI Storage", body_style), Paragraph("server/uploads/&lt;convoId&gt;/&lt;YYYY&gt;/&lt;MM&gt;/", body_style), Paragraph("Partitioned voice notes, images, videos, docs with token access control.", body_style)],
        [Paragraph("<b>Client Secrets</b>", body_style), Paragraph("WebCrypto API", body_style), Paragraph("Browser localStorage (wibby_e2ee_*)", body_style), Paragraph("ECDH P-256 private keys; strictly never transmitted to server.", body_style)]
    ]
    
    t = Table(table_data, colWidths=[90, 85, 175, 180])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#EDE9FE')),
        ('TEXTCOLOR', (0, 0), (-1, 0), primary_color),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, card_border),
        ('BOX', (0, 0), (-1, -1), 1, primary_color),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t)
    story.append(Spacer(1, 10))
    
    # Section 2: How to Verify Encryption
    story.append(Paragraph("2. How to Verify Encryption (Chats, Media, Calls)", h2_style))
    
    story.append(Paragraph("A. End-to-End Chat Encryption (ECDH P-256 + AES-GCM-256)", h3_style))
    story.append(Paragraph("• <b>Client-side Keys:</b> In DevTools (F12) → Application → LocalStorage, inspect <code>wibby_e2ee_priv_&lt;uid&gt;</code>. Private keys are never uploaded to the server.<br/>• <b>Safety Numbers:</b> In the chat UI, tap partner header → Chat Info → E2EE Security Card to cross-verify the 60-digit SHA-256 fingerprint.", body_style))
    
    story.append(Paragraph("B. Media Storage Protection (Token-Gated & Scoped)", h3_style))
    story.append(Paragraph("• <b>Protected Endpoints:</b> Media is fetched via <code>GET /api/conversations/:id/media/:key</code> requiring valid Firebase Bearer token and membership.<br/>• <b>Verification:</b> Paste any media URL in an Incognito window without logging in → instantly returns <b>HTTP 401 Unauthorized</b>.", body_style))
    
    story.append(Paragraph("C. Voice & Video Call Encryption (WebRTC DTLS-SRTP)", h3_style))
    story.append(Paragraph("• <b>Transport & Ciphers:</b> WebRTC streams use DTLS and SRTP (AEAD_AES_128_GCM). Server acts solely as an ephemeral signaling broker and never captures media.<br/>• <b>Verification:</b> In Google Chrome during an active call, open <code>chrome://webrtc-internals</code> → inspect DtlsTransport: <code>dtlsState: connected</code>.", body_style))
    story.append(Spacer(1, 6))
    
    # Section 3: Data Cleaning Commands
    story.append(Paragraph("3. Storage Auditing & Safe Cleaning Commands", h2_style))
    story.append(Paragraph("Execute these scripts from the <code>server/</code> directory to manage testing data and storage safely:", body_style))
    
    cmd_table_data = [
        [Paragraph("<b>Task & Intent</b>", body_style), Paragraph("<b>Command (from server directory)</b>", body_style), Paragraph("<b>Behavior & Safety</b>", body_style)],
        [
            Paragraph("<b>1. Inspect Storage</b>", body_style),
            Paragraph("<font color='#6D28D9'><b>npm run storage:inspect</b></font>", code_style),
            Paragraph("Read-only. Lists all DB counts, uploads directory size, active users, and test files.", body_style)
        ],
        [
            Paragraph("<b>2. Verify Encryption</b>", body_style),
            Paragraph("<font color='#6D28D9'><b>npm run storage:verify-encryption</b></font>", code_style),
            Paragraph("Tests DB confidentiality, media auth gates, and cryptographic algorithms.", body_style)
        ],
        [
            Paragraph("<b>3. Clean Test Data Only</b>", body_style),
            Paragraph("<font color='#6D28D9'><b>npm run storage:clean-tests</b></font>", code_style),
            Paragraph("<b>Safe cleanup:</b> Wipes test mock audio/images and test user accounts while preserving real paired users.", body_style)
        ],
        [
            Paragraph("<b>4. Complete Wipe</b>", body_style),
            Paragraph("<font color='#DC2626'><b>npm run storage:wipe-all</b></font>", code_style),
            Paragraph("Wipes all database collections and empties the uploads folder for a clean slate.", body_style)
        ]
    ]
    
    t2 = Table(cmd_table_data, colWidths=[120, 200, 210])
    t2.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F1F5F9')),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, card_border),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#94A3B8')),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t2)
    story.append(Spacer(1, 10))
    
    # Section 4: Folder Structure Integrity
    story.append(Paragraph("4. Clean Directory Structure Reference", h2_style))
    story.append(Paragraph("The codebase is organized into modular directories to avoid bundle bloat and ensure stable execution:", body_style))
    story.append(Paragraph("• <code>client/src/components/</code>: Modular UI components (ChatHeader, MessageArea, MiniMapWidget, call/, stories/)<br/>• <code>client/src/context/</code>: React Contexts (AuthContext, CallContext, SocketContext)<br/>• <code>server/src/routes/</code>: Authentication, Conversations, Messages, Media, Calls, Stories<br/>• <code>server/src/scripts/</code>: Storage auditing and verification CLI utilities<br/>• <code>server/uploads/</code>: Scoped local media storage partitioned by conversation ID", body_style))
    
    doc.build(story)
    print(f"PDF generated successfully at: {pdf_path}")

if __name__ == '__main__':
    generate_pdf()
