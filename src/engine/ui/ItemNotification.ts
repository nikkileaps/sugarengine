/**
 * Toast notification for item acquisition
 * Shows "Acquired: [Item Name]" with optional icon
 */
export class ItemNotification {
  private container: HTMLDivElement;

  constructor(parentContainer: HTMLElement) {
    this.injectStyles();

    this.container = document.createElement('div');
    this.container.className = 'item-notification-container';
    parentContainer.appendChild(this.container);
  }

  private injectStyles(): void {
    if (document.getElementById('item-notification-styles')) return;

    const style = document.createElement('style');
    style.id = 'item-notification-styles';
    style.textContent = `
      .item-notification-container {
        position: absolute;
        top: 140px;
        right: 20px;
        z-index: 150;
        pointer-events: none;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .item-notification {
        background: linear-gradient(180deg, rgba(35, 45, 35, 0.97) 0%, rgba(25, 35, 25, 0.98) 100%);
        border: 2px solid rgba(140, 180, 140, 0.4);
        border-radius: 12px;
        padding: 12px 18px;
        font-family: 'Segoe UI', system-ui, sans-serif;
        color: #e8f0e8;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        gap: 12px;
        opacity: 0;
        transform: translateX(100%);
        animation: itemNotificationSlideIn 0.3s ease-out forwards;
        max-width: 280px;
      }

      .item-notification.hiding {
        animation: itemNotificationSlideOut 0.3s ease-in forwards;
      }

      .item-notification-icon {
        width: 32px;
        height: 32px;
        background: rgba(140, 180, 140, 0.2);
        border: 1px solid rgba(140, 180, 140, 0.3);
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        flex-shrink: 0;
      }

      .item-notification-content {
        flex: 1;
      }

      .item-notification-label {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: rgba(140, 200, 140, 0.8);
        margin-bottom: 2px;
      }

      .item-notification-name {
        font-size: 14px;
        font-weight: 500;
        color: #e8f0e8;
      }

      .item-notification-quantity {
        font-size: 12px;
        color: rgba(232, 240, 232, 0.6);
      }

      @keyframes itemNotificationSlideIn {
        from {
          opacity: 0;
          transform: translateX(100%);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      @keyframes itemNotificationSlideOut {
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
   * Show an item acquired notification
   */
  show(itemName: string, quantity: number = 1, icon?: string): void {
    const notification = document.createElement('div');
    notification.className = 'item-notification';

    // Icon
    const iconEl = document.createElement('div');
    iconEl.className = 'item-notification-icon';
    if (icon) {
      const img = document.createElement('img');
      img.src = icon;
      img.style.width = '24px';
      img.style.height = '24px';
      iconEl.appendChild(img);
    } else {
      iconEl.textContent = '★';
    }
    notification.appendChild(iconEl);

    // Content
    const content = document.createElement('div');
    content.className = 'item-notification-content';

    const label = document.createElement('div');
    label.className = 'item-notification-label';
    label.textContent = 'Acquired';

    const name = document.createElement('div');
    name.className = 'item-notification-name';
    name.textContent = itemName;

    content.appendChild(label);
    content.appendChild(name);

    if (quantity > 1) {
      const qty = document.createElement('div');
      qty.className = 'item-notification-quantity';
      qty.textContent = `x${quantity}`;
      content.appendChild(qty);
    }

    notification.appendChild(content);
    this.container.appendChild(notification);

    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      notification.classList.add('hiding');
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, 3000);
  }

  dispose(): void {
    this.container.remove();
  }
}
