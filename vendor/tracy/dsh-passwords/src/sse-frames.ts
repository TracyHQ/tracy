/**
 * SSE 事件帧的有界缓冲。
 *
 * 事件流用空行分隔事件。按 WHATWG SSE 语义，行终止符是 CRLF、LF 或单个 CR 三者
 * 之一，空行即两个连续的行终止符，因此 `\n\n`、`\r\n\r\n`、`\r\r` 以及混合形式
 * （如 `\n\r\n`）都分隔事件。网关只把完整帧交给过滤函数，未终止的尾部必须留在
 * 缓冲里等待下一个 chunk（这也覆盖定界符被切到两个 chunk 的情况）。若上游不按协议
 * 发送空行（例如心跳只有单换行）或单个帧被无限拉长，这个尾部会无界增长；本类在
 * 超过上限时丢弃该未终止帧并从下一个空行重新同步。被丢弃的内容本来就无法解析成
 * 合法帧，调用方的过滤函数对无法解析的帧一律 fail-closed 丢弃，因此既不会放行
 * 未过滤内容，也不会让内存无界增长。
 */

/** 两个行终止符；裸 LF/CR 分支不得拆开 CRLF 的两个字符。 */
const SSE_BLANK_LINE = /(?:\r\n|\r(?!\n)|(?<!\r)\n)(?:\r\n|\r(?!\n)|(?<!\r)\n)/;

export class SseFrameBuffer {
  private pending = '';
  private pendingBytes = 0;
  /** 超限后进入重新同步：丢弃到下一个空行为止。 */
  private resyncing = false;

  constructor(private readonly maxPendingBytes: number) {}

  /** 追加一个已按 UTF-8 解码的 chunk，返回本次可交付的完整帧（原始字符串）。 */
  push(text: string): string[] {
    if (text === '') return [];
    if (this.resyncing) {
      const window = this.pending + text;
      const separator = SSE_BLANK_LINE.exec(window);
      if (separator === null) {
        // 保留最多 3 个字符，覆盖 `\r\n\r` + 后续 `\n` 这种跨 chunk 的 CRLF 空行。
        this.pending = window.slice(-3);
        return [];
      }
      this.pending = '';
      this.pendingBytes = 0;
      this.resyncing = false;
      const rest = window.slice(separator.index + separator[0].length);
      return rest === '' ? [] : this.collect(rest);
    }
    return this.collect(text);
  }

  /** 流结束时取出最后一个未终止帧；因超限被丢弃时为 []。 */
  flush(): string[] {
    if (this.resyncing || this.pending === '') return [];
    const tail = this.pending;
    this.pending = '';
    this.pendingBytes = 0;
    return [tail];
  }

  private collect(text: string): string[] {
    this.pending += text;
    this.pendingBytes += Buffer.byteLength(text, 'utf8');
    const frames = this.pending.split(SSE_BLANK_LINE);
    const tail = frames.pop() ?? '';
    // 没有命中分隔符时 split 返回同一个字符串实例，累计字节数无需重算；命中时
    // 尾部通常很短，重算成本可忽略。
    if (tail !== this.pending) {
      this.pending = tail;
      this.pendingBytes = tail === '' ? 0 : Buffer.byteLength(tail, 'utf8');
    }
    if (this.pendingBytes > this.maxPendingBytes) {
      // 未终止帧超过承载上限：整体丢弃，等待下一个空行重新同步。
      this.pending = '';
      this.pendingBytes = 0;
      this.resyncing = true;
    }
    return frames;
  }
}
