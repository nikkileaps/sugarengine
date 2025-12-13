import { DialogueLoader } from './DialogueLoader';
import { DialogueNode, DialogueChoice, LoadedDialogue } from './types';
import { DialogueBox } from '../ui/DialogueBox';

export type DialogueEventHandler = (eventName: string) => void;

/**
 * Manages dialogue flow - loading, displaying, and handling choices
 */
export class DialogueManager {
  private loader: DialogueLoader;
  private dialogueBox: DialogueBox;

  private currentDialogue: LoadedDialogue | null = null;
  private currentNode: DialogueNode | null = null;
  private isActive = false;

  private onDialogueStart: (() => void) | null = null;
  private onDialogueEnd: (() => void) | null = null;
  private onEvent: DialogueEventHandler | null = null;

  constructor(container: HTMLElement) {
    this.loader = new DialogueLoader();
    this.dialogueBox = new DialogueBox(container);
  }

  /**
   * Set callback for when dialogue starts
   */
  setOnStart(handler: () => void): void {
    this.onDialogueStart = handler;
  }

  /**
   * Set callback for when dialogue ends
   */
  setOnEnd(handler: () => void): void {
    this.onDialogueEnd = handler;
  }

  /**
   * Set callback for dialogue events (onEnter events from nodes)
   */
  setOnEvent(handler: DialogueEventHandler): void {
    this.onEvent = handler;
  }

  /**
   * Start a dialogue by ID
   */
  async start(dialogueId: string): Promise<void> {
    if (this.isActive) {
      console.warn('Dialogue already active, ending current before starting new');
      this.end();
    }

    try {
      this.currentDialogue = await this.loader.load(dialogueId);
    } catch (error) {
      console.error(`Failed to load dialogue: ${dialogueId}`, error);
      return;
    }

    this.isActive = true;

    if (this.onDialogueStart) {
      this.onDialogueStart();
    }

    // Go to start node
    const startNode = this.currentDialogue.nodeMap.get(this.currentDialogue.tree.startNode);
    if (startNode) {
      this.showNode(startNode);
    } else {
      console.error(`Start node not found: ${this.currentDialogue.tree.startNode}`);
      this.end();
    }
  }

  /**
   * Show a dialogue node
   */
  private showNode(node: DialogueNode): void {
    this.currentNode = node;

    // Fire onEnter event if present
    if (node.onEnter && this.onEvent) {
      this.onEvent(node.onEnter);
    }

    // Show in UI
    this.dialogueBox.show(
      node,
      (choice?: DialogueChoice) => {
        this.handleAdvance(choice);
      },
      () => {
        // Cancel callback - end dialogue on Escape
        this.end();
      }
    );
  }

  /**
   * Handle advancing to next node (via choice or continue)
   */
  private handleAdvance(choice?: DialogueChoice): void {
    if (!this.currentDialogue || !this.currentNode) {
      this.end();
      return;
    }

    // Determine next node ID
    let nextId: string | undefined;
    if (choice) {
      nextId = choice.next;
    } else {
      nextId = this.currentNode.next;
    }

    // If no next node, end dialogue
    if (!nextId) {
      this.end();
      return;
    }

    // Get and show next node
    const nextNode = this.currentDialogue.nodeMap.get(nextId);
    if (nextNode) {
      this.showNode(nextNode);
    } else {
      console.error(`Node not found: ${nextId}`);
      this.end();
    }
  }

  /**
   * End the current dialogue
   */
  end(): void {
    this.dialogueBox.hide();
    this.currentDialogue = null;
    this.currentNode = null;
    this.isActive = false;

    if (this.onDialogueEnd) {
      this.onDialogueEnd();
    }
  }

  /**
   * Check if dialogue is currently active
   */
  isDialogueActive(): boolean {
    return this.isActive;
  }

  /**
   * Preload dialogues for faster access
   */
  async preload(dialogueIds: string[]): Promise<void> {
    await this.loader.preloadAll(dialogueIds);
  }

  dispose(): void {
    this.dialogueBox.dispose();
  }
}
