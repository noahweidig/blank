import { syntaxTree } from '@codemirror/language'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import type { EditorState, Extension, Range } from '@codemirror/state'

/**
 * Obsidian-style live preview: markdown syntax is hidden on every line except
 * the ones a cursor or selection touches. Revealing the whole line, not just
 * the token, keeps typing on the active line stable: nothing on it is ever
 * replaced, so the text under the caret never jumps while you type.
 */

class BulletWidget extends WidgetType {
  eq() {
    return true
  }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-blank-bullet'
    span.textContent = '•'
    return span
  }
}

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super()
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked
  }
  toDOM() {
    const box = document.createElement('span')
    box.className = 'cm-blank-checkbox' + (this.checked ? ' is-checked' : '')
    box.setAttribute('role', 'checkbox')
    box.setAttribute('aria-checked', String(this.checked))
    return box
  }
  ignoreEvent() {
    return false
  }
}

class RuleWidget extends WidgetType {
  eq() {
    return true
  }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-blank-hr'
    return span
  }
}

const hide = Decoration.replace({})
const bullet = Decoration.replace({ widget: new BulletWidget() })
const rule = Decoration.replace({ widget: new RuleWidget() })
const ordered = Decoration.mark({ class: 'cm-blank-ol' })
const quoteLine = Decoration.line({ class: 'cm-blank-quote' })
const listLine = Decoration.line({ class: 'cm-blank-li' })

function activeLines(state: EditorState): Set<number> {
  const lines = new Set<number>()
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number
    const last = state.doc.lineAt(range.to).number
    for (let n = first; n <= last; n++) lines.add(n)
  }
  return lines
}

function build(view: EditorView): DecorationSet {
  const { state } = view
  const doc = state.doc
  const active = activeLines(state)
  const out: Array<Range<Decoration>> = []
  const isActive = (pos: number) => active.has(doc.lineAt(pos).number)
  // A trailing space belongs to the marker: `# Title` should start at T.
  const withSpace = (to: number) => (doc.sliceString(to, to + 1) === ' ' ? to + 1 : to)

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        const parent = node.node.parent?.name ?? ''
        switch (node.name) {
          case 'FencedCode':
          case 'CodeBlock':
          case 'Image':
            return false

          case 'Blockquote':
            for (let p = node.from; p <= node.to; ) {
              const line = doc.lineAt(p)
              out.push(quoteLine.range(line.from))
              p = line.to + 1
            }
            return

          case 'ListItem':
            out.push(listLine.range(doc.lineAt(node.from).from))
            return

          case 'HorizontalRule':
            if (!isActive(node.from)) out.push(rule.range(node.from, node.to))
            return

          case 'HeaderMark':
            if (parent.startsWith('ATXHeading') && !isActive(node.from)) {
              // Closing hashes (`## Title ##`) sit after the text.
              const closing = doc.sliceString(doc.lineAt(node.from).from, node.from).trim() !== ''
              const start = closing ? node.from - 1 : node.from
              out.push(hide.range(start, closing ? node.to : withSpace(node.to)))
            }
            return

          case 'QuoteMark':
            if (!isActive(node.from)) out.push(hide.range(node.from, withSpace(node.to)))
            return

          case 'EmphasisMark':
          case 'StrikethroughMark':
            if (!isActive(node.from)) out.push(hide.range(node.from, node.to))
            return

          case 'CodeMark':
            if (parent === 'InlineCode' && !isActive(node.from)) out.push(hide.range(node.from, node.to))
            return

          case 'Link': {
            if (isActive(node.from)) return false
            const marks = node.node.getChildren('LinkMark')
            const open = marks[0]
            const close = marks[1]
            // Autolinks (`<https://…>`) and reference links without a
            // destination keep their text: hiding would leave nothing.
            if (!open || !close || doc.sliceString(open.from, open.to) !== '[') return false
            out.push(hide.range(open.from, open.to))
            out.push(hide.range(close.from, node.to))
            return false
          }

          case 'ListMark': {
            if (isActive(node.from)) return
            const item = node.node.parent
            const list = item?.parent?.name
            const task = item?.getChild('Task')?.getChild('TaskMarker')
            if (task) {
              const checked = /x/i.test(doc.sliceString(task.from, task.to))
              out.push(hide.range(node.from, withSpace(node.to)))
              out.push(
                Decoration.replace({ widget: new CheckboxWidget(checked) }).range(task.from, task.to),
              )
            } else if (list === 'BulletList') {
              out.push(bullet.range(node.from, node.to))
            } else {
              out.push(ordered.range(node.from, node.to))
            }
            return
          }
        }
      },
    })
  }

  return Decoration.set(out, true)
}

function toggleAt(view: EditorView, pos: number): boolean {
  let node = syntaxTree(view.state).resolveInner(pos, 1)
  while (node.name !== 'TaskMarker') {
    if (!node.parent) return false
    node = node.parent
  }
  const checked = /x/i.test(view.state.doc.sliceString(node.from, node.to))
  view.dispatch({ changes: { from: node.from, to: node.to, insert: checked ? '[ ]' : '[x]' } })
  return true
}

export function livePreview(): Extension {
  return [
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet
        constructor(view: EditorView) {
          this.decorations = build(view)
        }
        update(update: ViewUpdate) {
          if (
            update.docChanged ||
            update.selectionSet ||
            update.viewportChanged ||
            syntaxTree(update.startState) !== syntaxTree(update.state)
          ) {
            this.decorations = build(update.view)
          }
        }
      },
      { decorations: (plugin) => plugin.decorations },
    ),
    EditorView.domEventHandlers({
      mousedown(event, view) {
        const box = (event.target as HTMLElement | null)?.closest('.cm-blank-checkbox')
        if (!box) return false
        // Swallow the click either way, or the caret lands on the line and
        // reveals the raw marker under the pointer.
        event.preventDefault()
        return toggleAt(view, view.posAtDOM(box))
      },
    }),
  ]
}
