import { create } from "zustand";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export type PromptMode = "text" | "folderName";

export interface PromptOptions {
  title: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  /** folderName：仅用于新建文件夹，会校验并拒绝类似文件名的输入 */
  mode?: PromptMode;
}

export interface ChoiceOption {
  id: string;
  label: string;
  primary?: boolean;
  danger?: boolean;
}

export interface ChoiceOptionMeta {
  description?: string;
  icon?: "minimize" | "quit" | "default";
}

export interface ChoiceOptions {
  title: string;
  message: string;
  choices: ChoiceOption[];
  cancelLabel?: string;
  /** 三按钮横排 | 纵向操作卡片（更精致） */
  layout?: "buttons" | "action-cards";
  choiceMeta?: Record<string, ChoiceOptionMeta>;
}

type ConfirmState = ConfirmOptions & { resolve: (ok: boolean) => void };
type PromptState = PromptOptions & { resolve: (value: string | null) => void };
type ChoiceState = ChoiceOptions & { resolve: (id: string | null) => void };

interface DialogStore {
  confirm: ConfirmState | null;
  prompt: PromptState | null;
  choice: ChoiceState | null;
  showConfirm: (opts: ConfirmOptions) => Promise<boolean>;
  showPrompt: (opts: PromptOptions) => Promise<string | null>;
  showChoice: (opts: ChoiceOptions) => Promise<string | null>;
  closeConfirm: (ok: boolean) => void;
  closePrompt: (value: string | null) => void;
  closeChoice: (id: string | null) => void;
}

export const useDialogStore = create<DialogStore>((set, get) => ({
  confirm: null,
  prompt: null,
  choice: null,

  showConfirm: (opts) =>
    new Promise((resolve) => {
      set({ confirm: { ...opts, resolve } });
    }),

  showPrompt: (opts) =>
    new Promise((resolve) => {
      set({ prompt: { ...opts, resolve } });
    }),

  showChoice: (opts) =>
    new Promise((resolve) => {
      set({ choice: { ...opts, resolve } });
    }),

  closeConfirm: (ok) => {
    const c = get().confirm;
    c?.resolve(ok);
    set({ confirm: null });
  },

  closePrompt: (value) => {
    const p = get().prompt;
    p?.resolve(value);
    set({ prompt: null });
  },

  closeChoice: (id) => {
    const c = get().choice;
    c?.resolve(id);
    set({ choice: null });
  },
}));
