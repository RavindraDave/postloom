import type { SenderSignature } from '@postloom/editor';
import { IconSignature } from '@tabler/icons-react';
import { NodeViewWrapper } from '@tiptap/react';
import { createContext, Fragment, useContext, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import classes from './TemplateEditor.module.css';

/** The chosen sender's signature, for Signature blocks in the letter. */
export const SignatureContext = createContext<{
  signature: SenderSignature | null | undefined;
  hasSender: boolean;
}>({ signature: null, hasSender: false });

type SignatureInline = NonNullable<SenderSignature['content'][number]['content']>[number];

function renderInline(node: SignatureInline, key: number): ReactNode {
  if (node.type === 'hardBreak') return <br key={key} />;
  const marked = (node.marks ?? []).reduce<ReactNode>((inner, mark) => {
    switch (mark.type) {
      case 'bold':
        return <strong>{inner}</strong>;
      case 'italic':
        return <em>{inner}</em>;
      case 'underline':
        return <u>{inner}</u>;
      case 'link':
        return <u>{inner}</u>;
      case 'textColor':
        return <span style={{ color: mark.attrs.color }}>{inner}</span>;
      case 'highlight':
        return <span style={{ backgroundColor: mark.attrs.color }}>{inner}</span>;
    }
  }, node.text);
  return <Fragment key={key}>{marked}</Fragment>;
}

/** A Signature block: the sender's signature as it will be sent (it's edited in Senders & accounts). */
export function SignatureView() {
  const { t } = useTranslation();
  const { signature, hasSender } = useContext(SignatureContext);
  return (
    <NodeViewWrapper
      className={classes.signatureBlock}
      data-signature=""
      data-testid="letter-signature"
      aria-label={t('editor.signatureBlock.label')}
      data-drag-handle=""
    >
      <div className={classes.signatureLabel} contentEditable={false}>
        <IconSignature size={13} aria-hidden /> {t('editor.signature')}
      </div>
      <div contentEditable={false}>
        {signature ? (
          signature.content.map((paragraph, index) => (
            <p key={index}>
              {(paragraph.content ?? []).map((node, at) => renderInline(node, at))}
              {!paragraph.content?.length && <br />}
            </p>
          ))
        ) : (
          <p className={classes.signatureEmpty}>
            {t(hasSender ? 'editor.signatureBlock.none' : 'editor.signatureBlock.noSender')}
          </p>
        )}
      </div>
    </NodeViewWrapper>
  );
}
