/**
 * Toast-style notification for quest events
 * Shows messages like "Quest Started", "Objective Complete", etc.
 */
export class QuestNotification {
  private container: HTMLDivElement;
  private queue: { message: string; type: NotificationType }[] = [];
  private isShowing = false;

  constructor(parentContainer: HTMLElement) {
    this.injectStyles();

    this.container = document.createElement('div');
    this.container.className = 'quest-notification-container';
    parentContainer.appendChild(this.container);
  }

  private injectStyles(): void {
    if (document.getElementById('quest-notification-styles')) return;

    const style = document.createElement('style');
    style.id = 'quest-notification-styles';
    style.textContent = `
      .quest-notification-container {
        position: absolute;
        top: 20px;
        right: 20px;
        z-index: 150;
        pointer-events: none;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .quest-notification {
        background: linear-gradient(180deg, rgba(35, 30, 45, 0.97) 0%, rgba(25, 22, 35, 0.98) 100%);
        border: 2px solid rgba(180, 160, 140, 0.4);
        border-radius: 12px;
        padding: 14px 20px;
        font-family: 'Segoe UI', system-ui, sans-serif;
        color: #f0e6d8;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        opacity: 0;
        transform: translateX(100%);
        animation: questNotificationSlideIn 0.3s ease-out forwards;
        max-width: 320px;
      }

      .quest-notification.hiding {
        animation: questNotificationSlideOut 0.3s ease-in forwards;
      }

      .quest-notification-type {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-bottom: 4px;
        opacity: 0.7;
      }

      .quest-notification-type.quest-start {
        color: #88d4a0;
      }

      .quest-notification-type.quest-complete {
        color: #f0d888;
      }

      .quest-notification-type.objective-complete {
        color: #a8d4f0;
      }

      .quest-notification-type.stage-complete {
        color: #c8a8f0;
      }

      .quest-notification-message {
        font-size: 15px;
        line-height: 1.4;
      }

      @keyframes questNotificationSlideIn {
        from {
          opacity: 0;
          transform: translateX(100%);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      @keyframes questNotificationSlideOut {
        from {
          opacity: 1;
          transform: translateX(0);
        }
        to {
          opacity: 0;
          transform: translateX(100%);
        }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Show a quest start notification
   */
  showQuestStart(questName: string): void {
    this.enqueue(`Quest Started: ${questName}`, 'quest-start');
  }

  /**
   * Show a quest complete notification
   */
  showQuestComplete(questName: string): void {
    this.enqueue(`Quest Complete: ${questName}`, 'quest-complete');
  }

  /**
   * Show an objective complete notification
   */
  showObjectiveComplete(description: string): void {
    this.enqueue(description, 'objective-complete');
  }

  /**
   * Show a stage complete notification
   */
  showStageComplete(description: string): void {
    this.enqueue(description, 'stage-complete');
  }

  /**
   * Show a generic notification
   */
  show(message: string, type: NotificationType = 'objective-complete'): void {
    this.enqueue(message, type);
  }

  private enqueue(message: string, type: NotificationType): void {
    this.queue.push({ message, type });
    this.processQueue();
  }

  private processQueue(): void {
    if (this.isShowing || this.queue.length === 0) return;

    const item = this.queue.shift();
    if (!item) return;

    this.isShowing = true;
    this.displayNotification(item.message, item.type);
  }

  private displayNotification(message: string, type: NotificationType): void {
    const notification = document.createElement('div');
    notification.className = 'quest-notification';

    const typeLabel = document.createElement('div');
    typeLabel.className = `quest-notification-type ${type}`;
    typeLabel.textContent = this.getTypeLabel(type);

    const messageEl = document.createElement('div');
    messageEl.className = 'quest-notification-message';
    messageEl.textContent = message;

    notification.appendChild(typeLabel);
    notification.appendChild(messageEl);
    this.container.appendChild(notification);

    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      notification.classList.add('hiding');
      setTimeout(() => {
        notification.remove();
        this.isShowing = false;
        this.processQueue();
      }, 300);
    }, 3000);
  }

  private getTypeLabel(type: NotificationType): string {
    switch (type) {
      case 'quest-start':
        return 'New Quest';
      case 'quest-complete':
        return 'Quest Complete';
      case 'objective-complete':
        return 'Objective Complete';
      case 'stage-complete':
        return 'Stage Complete';
      default:
        return 'Quest Update';
    }
  }

  dispose(): void {
    this.container.remove();
  }
}

type NotificationType = 'quest-start' | 'quest-complete' | 'objective-complete' | 'stage-complete';
