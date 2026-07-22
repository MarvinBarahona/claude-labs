import { Pipe, PipeTransform } from '@angular/core';
import { renderMarkdown } from './render-markdown';

@Pipe({
  name: 'markdown',
})
export class MarkdownPipe implements PipeTransform {
  transform(value: string): string {
    return renderMarkdown(value);
  }
}
