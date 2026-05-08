/**
 * 진행 상황을 단일 텔레그램 메시지에 in-place로 업데이트하는 reporter.
 * 알림 폭격 없이 각 에이전트 단계의 라이브 상태를 폰에서 볼 수 있음.
 */

interface MarketingState {
  status: 'in-progress' | 'done';
  keyword?: string;
  intent?: string;
}

interface OperationsState {
  status: 'in-progress' | 'done';
  chars?: number;
  tags?: number;
  revisionAttempt?: number; // 1 = 1차 작성, 2 = 1차 revision, ...
}

interface QaState {
  status: 'in-progress' | 'done';
  approved?: boolean;
  severity?: string;
  majorIssueCount?: number;
  minorIssueCount?: number;
  comment?: string;
  attempt?: number;
}

interface FinalState {
  outcome: 'approved' | 'rejected' | 'system-error';
  postId?: string;
  errorMessage?: string;
  qaIssues?: { description: string; level: string }[];
  totalRevisions?: number;
}

interface ProgressState {
  marketing?: MarketingState;
  operations?: OperationsState;
  qa?: QaState;
  revisionHistory?: { qaSummary: string; majorCount: number }[]; // 이전 revision 요약
  final?: FinalState;
}

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '...' : s);

export class TelegramReporter {
  private messageId: number | null = null;
  private state: ProgressState = {};
  private readonly token: string | undefined;
  private readonly chatId: string | undefined;
  private readonly blogUrl: string;
  private enabled: boolean;

  constructor() {
    this.token = process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = process.env.TELEGRAM_CHAT_ID;
    this.blogUrl = (process.env.BLOG_BASE_URL ?? '').replace(/\/$/, '');
    this.enabled = !!(this.token && this.chatId);
  }

  async start(): Promise<void> {
    if (!this.enabled) return;
    const text = this.render();
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
          disable_web_page_preview: true,
        }),
      });
      if (!res.ok) {
        console.warn(`Telegram start HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        this.enabled = false;
        return;
      }
      const json = (await res.json()) as { result?: { message_id?: number } };
      this.messageId = json.result?.message_id ?? null;
      if (this.messageId === null) this.enabled = false;
    } catch (e) {
      console.warn('Telegram start failed:', e instanceof Error ? e.message : String(e));
      this.enabled = false;
    }
  }

  async update(patch: Partial<ProgressState>): Promise<void> {
    // state 병합
    if (patch.marketing) this.state.marketing = { ...this.state.marketing, ...patch.marketing };
    if (patch.operations) this.state.operations = { ...this.state.operations, ...patch.operations };
    if (patch.qa) this.state.qa = { ...this.state.qa, ...patch.qa };
    if (patch.revisionHistory) this.state.revisionHistory = patch.revisionHistory;
    if (patch.final) this.state.final = patch.final;

    if (!this.enabled || this.messageId === null) return;

    const text = this.render();
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.token}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          message_id: this.messageId,
          text,
          disable_web_page_preview: true,
        }),
      });
      if (!res.ok) {
        const errText = (await res.text()).slice(0, 200);
        // "message is not modified" 는 무시 (같은 내용 edit 시도)
        if (!errText.includes('message is not modified')) {
          console.warn(`Telegram update HTTP ${res.status}: ${errText}`);
        }
      }
    } catch (e) {
      console.warn('Telegram update failed:', e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * 시스템 오류 등으로 reporter가 시작도 못 한 상태에서 fallback 메시지 전송용.
   */
  async sendSimpleError(message: string): Promise<void> {
    if (!this.token || !this.chatId) return;
    if (this.messageId !== null) {
      // 이미 메시지가 있으면 그걸 업데이트
      this.state.final = { outcome: 'system-error', errorMessage: message };
      await this.update({});
      return;
    }
    try {
      const text = `❌ 자동 포스팅 시스템 오류\n\n${message}${this.blogUrl ? `\n\n📋 실행 기록: ${this.blogUrl}/admin/runs` : ''}`;
      await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text,
          disable_web_page_preview: true,
        }),
      });
    } catch (e) {
      console.warn('Telegram simple error send failed:', e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * 현재 state를 사람이 읽을 수 있는 텔레그램 메시지로 렌더링.
   */
  private render(): string {
    const lines: string[] = [];
    const { marketing, operations, qa, revisionHistory, final } = this.state;

    // 헤더
    if (final) {
      if (final.outcome === 'approved') {
        lines.push('🤖 자동 포스팅 완료 ✅');
      } else if (final.outcome === 'rejected') {
        lines.push('🤖 자동 포스팅 실패 (QA 거절) ❌');
      } else {
        lines.push('❌ 자동 포스팅 시스템 오류');
      }
    } else {
      lines.push('🤖 자동 포스팅 진행 중');
    }
    lines.push('');

    // 마케팅
    if (marketing) {
      if (marketing.status === 'done' && marketing.keyword) {
        lines.push('🎯 마케팅팀 ✓');
        lines.push(`└ 키워드: ${marketing.keyword}`);
        if (marketing.intent) {
          lines.push(`└ 의도: ${truncate(marketing.intent, 80)}`);
        }
      } else {
        lines.push('⏳ 마케팅팀: 키워드 분석 중...');
      }
    }

    // Revision 히스토리 요약 (재작성이 있었을 때 이전 시도 표시)
    if (revisionHistory && revisionHistory.length > 0) {
      lines.push('');
      revisionHistory.forEach((r, i) => {
        lines.push(`✍️ 업무부 (${i + 1}차) ✓`);
        lines.push(`🔍 품질관리팀 ✗ ${r.qaSummary}`);
      });
    }

    // 현재 Operations 상태
    if (operations) {
      lines.push('');
      const attemptLabel =
        operations.revisionAttempt && operations.revisionAttempt > 1
          ? ` (${operations.revisionAttempt}차)`
          : '';
      if (operations.status === 'done') {
        lines.push(`✍️ 업무부 ✓${attemptLabel}`);
        if (operations.chars !== undefined) {
          lines.push(`└ 작성: ${operations.chars.toLocaleString()}자, 태그 ${operations.tags ?? 0}개`);
        }
      } else {
        lines.push(`⏳ 업무부: 본문 ${operations.revisionAttempt && operations.revisionAttempt > 1 ? '재작성' : '작성'} 중${attemptLabel}...`);
      }
    }

    // QA
    if (qa) {
      lines.push('');
      if (qa.status === 'done') {
        if (qa.approved) {
          const sevText = qa.severity === 'ok' ? '통과' : `${qa.severity} 이슈 통과`;
          lines.push(`🔍 품질관리팀 ✓ ${sevText}`);
          if (qa.comment) {
            lines.push(`└ "${truncate(qa.comment, 100)}"`);
          }
        } else {
          lines.push(`🔍 품질관리팀 ✗ 재작성 요청`);
          lines.push(`└ major ${qa.majorIssueCount ?? 0}개, minor ${qa.minorIssueCount ?? 0}개`);
          if (qa.comment) {
            lines.push(`└ "${truncate(qa.comment, 100)}"`);
          }
        }
      } else {
        lines.push('⏳ 품질관리팀: 검토 중...');
      }
    }

    // 최종 상태
    if (final) {
      lines.push('');
      if (final.outcome === 'approved') {
        if (final.totalRevisions && final.totalRevisions > 0) {
          lines.push(`🔄 총 ${final.totalRevisions}회 재작성 후 통과`);
        }
        if (this.blogUrl && final.postId) {
          lines.push('');
          lines.push(`📄 검토: ${this.blogUrl}/p/${final.postId}`);
          lines.push(`📋 모든 초안: ${this.blogUrl}/drafts`);
        } else if (final.postId) {
          lines.push(`Post ID: ${final.postId}`);
        }
      } else if (final.outcome === 'rejected') {
        if (final.qaIssues && final.qaIssues.length > 0) {
          lines.push('QA 지적:');
          final.qaIssues.slice(0, 5).forEach((i) => {
            lines.push(`- [${i.level}] ${truncate(i.description, 100)}`);
          });
        }
        if (this.blogUrl) {
          lines.push('');
          lines.push(`📋 실행 기록: ${this.blogUrl}/admin/runs`);
        }
      } else {
        if (final.errorMessage) {
          lines.push(truncate(final.errorMessage, 300));
        }
        if (this.blogUrl) {
          lines.push('');
          lines.push(`📋 실행 기록: ${this.blogUrl}/admin/runs`);
        }
      }
    }

    return lines.join('\n');
  }
}
