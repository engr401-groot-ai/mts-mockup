export type ActionHandler = () => void;

export interface ModalProps {
  open: boolean;
  onClose: () => void;
}

export interface PlayerProgress {
  playedSeconds: number;
}
