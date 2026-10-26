'use client';
import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type ReactElement,
} from 'react';
import * as R from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
type OptionProps = {
  value?: string | number;
  disabled?: boolean;
  children?: ReactNode;
  'data-description'?: string;
};
type Props = {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  disabled?: boolean;
  required?: boolean;
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  onChange?: (event: { target: { value: string } }) => void;
};
function text(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) =>
      isValidElement<OptionProps>(child) ? text(child.props.children) : String(child),
    )
    .join('');
}
const EMPTY = '__parius_no_selection__';
export function Select({
  id,
  name,
  value,
  defaultValue,
  disabled,
  required,
  children,
  className = '',
  onChange,
  ...aria
}: Props) {
  const generated = useId(),
    trigger = useRef<HTMLButtonElement | null>(null);
  const options = Children.toArray(children)
    .filter(isValidElement)
    .map((node) => {
      const option = node as ReactElement<OptionProps>;
      return {
        value: String(option.props.value ?? text(option.props.children)),
        label: text(option.props.children),
        disabled: option.props.disabled,
        description: option.props['data-description'],
      };
    });
  const initial = defaultValue ?? options[0]?.value ?? '';
  const [local, setLocal] = useState(initial),
    [invalid, setInvalid] = useState(false),
    [container, setContainer] = useState<HTMLElement | null>(null);
  const selected = value ?? local,
    fieldId = id || generated;
  const attach = useCallback((node: HTMLButtonElement | null) => {
    trigger.current = node;
    if (node) setContainer(node.closest('dialog'));
  }, []);
  useEffect(() => {
    const form = trigger.current?.closest('form');
    const reset = () => {
      setLocal(initial);
      setInvalid(false);
    };
    form?.addEventListener('reset', reset);
    return () => form?.removeEventListener('reset', reset);
  }, [initial]);
  return (
    <div data-select className={`relative w-full ${className}`}>
      {name && <input type="hidden" name={name} value={selected} disabled={disabled} />}
      {required && (
        <input
          aria-hidden="true"
          tabIndex={-1}
          className="sr-only! m-0! size-px! border-0! p-0!"
          value={selected}
          required
          disabled={disabled}
          onChange={() => {}}
          onInvalid={(e) => {
            e.preventDefault();
            setInvalid(true);
            trigger.current?.focus();
          }}
        />
      )}
      <R.Root
        value={selected || EMPTY}
        disabled={disabled}
        onValueChange={(next) => {
          const actual = next === EMPTY ? '' : next;
          setLocal(actual);
          setInvalid(false);
          onChange?.({ target: { value: actual } });
        }}
      >
        <R.Trigger
          ref={attach}
          id={fieldId}
          {...aria}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${fieldId}-error` : aria['aria-describedby']}
          className="flex min-h-12 w-full items-center justify-between gap-4 rounded-xl border border-white/25 bg-slate px-4 py-3 text-left text-sm font-normal text-paper outline-none transition-colors hover:border-white/40 focus-visible:border-ice focus-visible:ring-2 focus-visible:ring-ice/25 disabled:cursor-not-allowed disabled:opacity-40 [&>span:first-child]:min-w-0 [&>span:first-child]:truncate"
        >
          <R.Value>
            {options.find((option) => option.value === selected)?.label || 'Choose an option'}
          </R.Value>
          <R.Icon>
            <ChevronDown size={15} className="text-ash" />
          </R.Icon>
        </R.Trigger>
        <R.Portal container={container || undefined}>
          <R.Content
            position="popper"
            sideOffset={6}
            collisionPadding={12}
            className="z-50 max-h-[min(320px,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)] min-w-40 overflow-hidden rounded-xl border border-white/15 bg-slate p-1.5 text-sm text-paper shadow-xl shadow-black/30 outline-none"
          >
            <R.ScrollUpButton className="flex h-7 items-center justify-center text-ash">
              <ChevronUp size={14} />
            </R.ScrollUpButton>
            <R.Viewport>
              {options.map((option) => (
                <R.Item
                  key={option.value || EMPTY}
                  value={option.value || EMPTY}
                  textValue={option.label}
                  aria-describedby={option.description ? `${generated}-${option.value}` : undefined}
                  disabled={option.disabled}
                  className="relative flex min-h-11 cursor-default items-center rounded-lg py-2 pr-9 pl-3 leading-snug outline-none select-none data-[highlighted]:bg-white/7 data-[highlighted]:text-paper data-[disabled]:pointer-events-none data-[disabled]:opacity-40"
                >
                  <span>
                    <R.ItemText>{option.label}</R.ItemText>
                    {option.description && (
                      <span
                        id={`${generated}-${option.value}`}
                        className="mt-1 block text-xs text-ash"
                      >
                        {option.description}
                      </span>
                    )}
                  </span>
                  <R.ItemIndicator className="absolute right-3 text-ice">
                    <Check size={14} />
                  </R.ItemIndicator>
                </R.Item>
              ))}
            </R.Viewport>
            <R.ScrollDownButton className="flex h-7 items-center justify-center text-ash">
              <ChevronDown size={14} />
            </R.ScrollDownButton>
          </R.Content>
        </R.Portal>
      </R.Root>
      {invalid && (
        <p id={`${fieldId}-error`} role="alert" className="mt-2 text-xs text-danger">
          Choose an option.
        </p>
      )}
    </div>
  );
}
