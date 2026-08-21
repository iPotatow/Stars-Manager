import Vue from "../../vue-runtime.ts";
import { AlertTriangle } from '@lucide/vue';
import { Button } from './button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { cn } from '../../lib/utils';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'danger' | 'warning' | 'info';
}

export const ConfirmDialog: Vue.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  type = 'warning',
}) => (
  <Dialog
    open={isOpen}
    onUpdate:open={(open: boolean) => {
      if (!open) onCancel();
    }}
  >
    <DialogContent class="max-w-md rounded-2xl p-0">
      <DialogHeader class="p-6 pb-2">
        <div className="flex items-start gap-4">
          <div className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-full',
            type === 'danger' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary',
          )}>
            <AlertTriangle className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-2">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{message}</DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <DialogFooter class="px-6 py-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          {cancelText}
        </Button>
        <Button
          type="button"
          variant={type === 'danger' ? 'destructive' : 'default'}
          onClick={onConfirm}
        >
          {confirmText}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
