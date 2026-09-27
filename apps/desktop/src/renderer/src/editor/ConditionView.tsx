import { ConditionalNode, writeModeExtensions } from '@postloom/editor/tiptap';
import { IconEye } from '@tabler/icons-react';
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from '@tiptap/react';
import { useTranslation } from 'react-i18next';
import { SignatureNode } from '@postloom/editor/tiptap';
import { SignatureView } from './SignatureView';
import classes from './TemplateEditor.module.css';

/** Says, in words, who sees a "show only if" part. */
export function useRuleText() {
  const { t } = useTranslation();
  return (attrs: Record<string, unknown>) => {
    const text = (value: unknown) => (typeof value === 'string' ? value : '');
    const op = text(attrs['op']) || 'notEmpty';
    return t('editor.rule.shownIf', {
      field: text(attrs['field']),
      condition: t(`editor.rule.${op}`, { value: text(attrs['value']) }),
    });
  };
}

/** A framed part of the letter with its rule written above it. */
function ConditionFrame({ node }: NodeViewProps) {
  const ruleText = useRuleText();
  return (
    <NodeViewWrapper className={classes.conditional} data-conditional="">
      <div className={classes.conditionalLabel} contentEditable={false}>
        <IconEye size={14} aria-hidden /> {ruleText(node.attrs)}
      </div>
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

const ConditionalWithFrame = ConditionalNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ConditionFrame);
  },
});

const SignatureWithPreview = SignatureNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(SignatureView);
  },
});

/**
 * The editor's extensions, with the on-screen frame for "show only if" parts
 * and the sender's signature shown in Signature blocks.
 */
export const editorExtensions = writeModeExtensions.map((extension) =>
  extension.name === 'conditional'
    ? ConditionalWithFrame
    : extension.name === 'signature'
      ? SignatureWithPreview
      : extension,
);
