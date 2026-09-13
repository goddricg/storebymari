# คู่มือใช้งาน MQAF กับ AI ทุกค่ายแบบ Copy-Paste

MQAF มี Prompt กลางที่ไม่ผูกกับชื่อโมเดล จึงนำไปใช้กับ ChatGPT, Codex, Claude,
Gemini, GitHub Copilot, Cursor, Windsurf, Cline, Roo Code, Amazon Q Developer,
JetBrains Junie, Aider รวมถึง Chat AI, API และ Local Model อื่นได้

สิ่งที่ใช้ร่วมกันได้คือ Persona, วิธีคิด, Orchestrator, 14 Modes, 12 Dev AI,
Debate/Decision, permission gates, การตรวจงาน และรูปแบบหลักฐาน ส่วนความสามารถ
แก้ไฟล์ รันคำสั่ง เปิดเว็บ ใช้ subagent จำข้ามแชต หรือ deploy ขึ้นอยู่กับ
AI และเครื่องมือจริงของแต่ละแพลตฟอร์ม

## เริ่มแบบเร็วที่สุด

### วิธี A: ใช้กับ Chat AI ทั่วไป

1. เลือก Prompt:
   - ใช้ [`Full`](../adapters/universal/MEW-UNIVERSAL-FULL.md) ถ้าช่องรองรับ
     ข้อความยาว
   - ใช้ [`Compact`](../adapters/universal/MEW-UNIVERSAL-COMPACT.md) ถ้าต้องการ
     ลด context
   - ใช้ [`Micro 1500`](../adapters/universal/MEW-UNIVERSAL-MICRO-1500.md)
     เมื่อช่องจำกัด 1,500 ตัวอักษร
2. เปิดไฟล์แล้วคัดลอกเนื้อหาทั้งหมด
3. วางใน System Prompt, Project Instructions, Custom Agent Instructions หรือ
  ช่องคำสั่งถาวรที่แพลตฟอร์มนั้นรองรับ
4. เริ่มแชตใหม่ถ้าแพลตฟอร์มอ่านคำสั่งเฉพาะตอนเริ่ม Session
5. ส่ง [`Mew activation message`](../adapters/universal/MEW-ACTIVATION-MESSAGE.md)
6. ตรวจว่า AI บอกความสามารถจริงและไม่อ้างเครื่องมือที่ไม่มี
7. ส่ง Requirement แรกได้ทันที

ถ้าแพลตฟอร์มไม่มีช่องคำสั่งถาวร ให้วาง Full หรือ Compact เป็นข้อความแรกของ
แชตใหม่ทุกครั้ง

### วิธี B: ใช้กับ AI Dev ในโปรเจกต์

วิธีที่ครบที่สุดคือคัดลอก MQAF ทั้งชุดไว้กับโปรเจกต์:

```text
AGENTS.md
Agent.md
docs/
skills/
templates/
scripts/validate_framework.py
```

จากนั้นใช้ไฟล์คำสั่งที่ AI Dev รองรับ:

| AI Dev | ตำแหน่งวาง |
|---|---|
| Codex | `AGENTS.md` |
| Claude Code | `CLAUDE.md` หรือ `.claude/CLAUDE.md` |
| Gemini CLI | `GEMINI.md` |
| GitHub Copilot | `.github/copilot-instructions.md` หรือ `AGENTS.md` ใน Surface ที่รองรับ |
| Cursor | `AGENTS.md` ที่ root |
| Windsurf | `AGENTS.md` ที่ root หรือในโฟลเดอร์ย่อย |
| Cline | `.clinerules/00-mew.md` หรือ `AGENTS.md` |
| Roo Code | `.roo/rules/00-mew.md` หรือ `AGENTS.md` |
| Amazon Q Developer | `.amazonq/rules/mew.md` |
| JetBrains Junie | `.junie/guidelines.md` |
| Aider | `CONVENTIONS.md` แล้วเรียก `aider --read CONVENTIONS.md` |

ถ้ามีไฟล์คำสั่งเดิมอยู่แล้ว ห้ามเขียนทับทันที ให้นำกฎ MQAF ไปรวมโดยรักษา
กฎเฉพาะของโปรเจกต์ คำสั่งที่ใกล้ไฟล์งานกว่า และข้อจำกัดที่มีลำดับสูงกว่า

Claude Code สามารถเชื่อมกับ MQAF `AGENTS.md` ด้วย `CLAUDE.md`:

```md
@AGENTS.md
```

Gemini CLI สามารถเชื่อมด้วย `GEMINI.md`:

```md
@./AGENTS.md
```

รายละเอียดตำแหน่งวาง ขอบเขต และลิงก์เอกสารทางการอยู่ที่
[`adapters/README.md`](../adapters/README.md)

## ข้อมูลที่ควรให้ Mew ก่อนเริ่มโปรเจกต์

ใช้ [`PROJECT_CONTEXT.md`](../templates/PROJECT_CONTEXT.md) และ
[`AI_RUNTIME_PROFILE.md`](../templates/AI_RUNTIME_PROFILE.md) เพื่อบอก:

- เป้าหมายทางธุรกิจและผู้ใช้
- Repository, Workspace, Tenant, Account และ Environment ที่อยู่ในขอบเขต
- Tech Stack และ Version จริง
- คำสั่ง install, lint, typecheck, test, build และ preview ที่ตรวจแล้ว
- Coding Standards และ Architecture ของทีม
- ข้อกำหนด Security, Privacy, Data Retention และ Compatibility
- สิ่งที่ห้ามแก้และสิ่งที่อยู่นอกขอบเขต
- การกระทำที่อนุญาตแล้ว
- การกระทำที่ต้องขออนุมัติก่อน
- Acceptance Criteria และหลักฐานที่ต้องมีจึงเรียกว่าเสร็จ

ห้ามใส่ API key, password, private key, token, ข้อมูลลูกค้า หรือความลับลงใน
Prompt, Project Knowledge หรือไฟล์ Context

## รูปแบบส่งงานแรก

คัดลอกข้อความนี้แล้วกรอกข้อมูลจริง:

```text
ใช้ Mew ทำงานนี้

เป้าหมาย:
ผลลัพธ์ที่ผู้ใช้ต้องเห็น:
Repository/Folder:
In scope:
Out of scope:
Tech stack และข้อห้าม:
อนุญาตให้ทำ:
ต้องขออนุมัติก่อน:
Acceptance criteria:
หลักฐานที่ต้องการ:

ให้เลือก Mode และ Dev AI roles ที่จำเป็นเอง
ถ้ามี subagent จริงให้แบ่งงานที่เป็นอิสระกัน
ถ้าไม่มีให้ทำ role pass แบบลำดับเดียว
ห้ามอ้างว่าทดสอบหรือ deploy แล้วถ้าไม่มีหลักฐาน
```

## ตัวอย่างการเรียกใช้

สร้างฟีเจอร์:

```text
ใช้ Mew เพิ่มระบบสมาชิกในโปรเจกต์นี้ ตั้งแต่ UX, API, Database, Security
จนถึง Automated Testing แต่ยังไม่ deploy Production
```

ตรวจงานอย่างเดียว:

```text
ใช้ Mew Review Mode ตรวจ Pull Request นี้แบบ read-only
สรุปเฉพาะปัญหาที่มีหลักฐานและยังไม่แก้ไฟล์
```

หาสาเหตุและแก้:

```text
ใช้ Mew Debug Mode หาสาเหตุจากหลักฐานก่อน
ถ้ายืนยันสาเหตุได้ให้แก้เฉพาะขอบเขตนี้และรัน Regression Test
```

ออกแบบระบบ:

```text
ใช้ Mew Architect Mode เปรียบเทียบอย่างน้อย 2 แนวทาง
ใช้ Debate + Decision Engine ระบุ trade-off, fallback และเงื่อนไขที่ต้องทบทวน
```

## วิธีตรวจว่าเปิดใช้สำเร็จ

ผล Activation ที่ดีควร:

- ตอบ `MEW READY`
- บอกว่า file, shell, web, browser, subagent และ memory มีจริงหรือไม่มี
- ใช้ชื่อ 14 Modes และ 12 Dev AI roles ตรงตาม Framework
- ยืนยันว่า Production, destructive action, migration, billing, security,
  cross-repository และ publication ยังต้องขออนุมัติ
- ใช้สถานะ `verified`, `observed`, `inferred`, `proposed`, `failed`,
  `not_run`, `blocked`
- ไม่อ้างว่าอ่านไฟล์ รัน Test หรือจำข้อมูลได้ หากแพลตฟอร์มไม่ได้ให้ความสามารถนั้น

การตอบ Activation ผ่าน หมายถึง AI เข้าใจ Prompt ใน Session นั้น ไม่ได้
รับประกันว่าจะทำถูกทุกงาน ต้องตรวจผลลัพธ์จริงทุกครั้ง

## เลือกไฟล์ไหนดี

| สถานการณ์ | ไฟล์แนะนำ |
|---|---|
| ChatGPT Custom Instructions ทุกแผน | Micro 1500 |
| ChatGPT Project / Custom GPT | Full; ถ้าใส่ไม่ได้ใช้ Compact |
| Claude.ai Project / Gemini Gem | Full หรือ Compact |
| Claude Code | Compact หรือ `@AGENTS.md` |
| Codex / Cursor / Windsurf | MQAF `AGENTS.md` แบบเต็มชุด หรือ Full/Compact แบบไฟล์เดียว |
| API / Local Model ที่มี System Prompt | Full |
| แชตที่ Context จำกัด | Compact |
| ไม่ทราบ Limit | เริ่ม Full แล้วลดเป็น Compact หรือ Micro เมื่อระบบปฏิเสธ |

ข้อจำกัดของแต่ละค่ายเปลี่ยนแปลงได้ ให้ตรวจเอกสารทางการล่าสุดจาก
[`adapters/README.md`](../adapters/README.md) ก่อนพึ่งพาพฤติกรรมเฉพาะแพลตฟอร์ม
