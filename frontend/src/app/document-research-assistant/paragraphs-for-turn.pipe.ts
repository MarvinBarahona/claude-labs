import { Pipe, PipeTransform } from '@angular/core';
import type { AnswerParagraph, TranscriptTurn } from './document-research-assistant';

@Pipe({
  name: 'paragraphsForTurn',
})
export class ParagraphsForTurnPipe implements PipeTransform {
  transform(turns: readonly TranscriptTurn[], index: number): readonly AnswerParagraph[] | null {
    return turns[index]?.paragraphs ?? null;
  }
}
