/**
 * InspectionPanel - Editor for inspectable content
 */

import { BasePanel } from './BasePanel';
import { editorStore } from '../store';
import type { FieldDefinition } from '../components';

interface InspectionSection {
  heading?: string;
  text: string;
}

interface InspectionData {
  id: string;
  title: string;
  subtitle?: string;
  headerImage?: string;
  content?: string;
  sections?: InspectionSection[];
}

const INSPECTION_FIELDS: FieldDefinition[] = [
  { key: 'id', label: 'ID', type: 'text', required: true },
  { key: 'title', label: 'Title', type: 'text', required: true },
  { key: 'subtitle', label: 'Subtitle', type: 'text' },
  { key: 'headerImage', label: 'Header Image', type: 'text', placeholder: '/images/header.png' },
  { key: 'content', label: 'Content', type: 'textarea', placeholder: 'Main text content...' },
];

export class InspectionPanel extends BasePanel {
  private inspections: Map<string, InspectionData> = new Map();
  private currentInspectionId: string | null = null;

  constructor() {
    super({
      title: 'Inspections',
      inspectorTitle: 'Properties',
      inspectorFields: INSPECTION_FIELDS,
      onCreate: () => this.createNewInspection(),
    });

    this.renderCenterPlaceholder();
  }

  addInspection(inspection: InspectionData): void {
    this.inspections.set(inspection.id, inspection);
    this.updateEntryList();
    editorStore.setDirty(true);
  }

  getInspections(): InspectionData[] {
    return Array.from(this.inspections.values());
  }

  private updateEntryList(): void {
    const items = Array.from(this.inspections.values()).map(i => ({
      id: i.id,
      name: i.title,
      subtitle: i.subtitle ?? 'Document',
      icon: '🔍',
    }));
    this.setEntries(items);
  }

  private renderCenterPlaceholder(): void {
    const placeholder = document.createElement('div');
    placeholder.style.cssText = `
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #6c7086;
      gap: 12px;
    `;
    placeholder.innerHTML = `
      <div style="font-size: 48px;">🔍</div>
      <div style="font-size: 16px;">Select an inspection to edit</div>
      <div style="font-size: 13px; max-width: 300px; text-align: center; line-height: 1.5;">
        Create inspectable content like signs, newspapers, and documents.
      </div>
    `;
    this.setCenterContent(placeholder);
  }

  private renderInspectionPreview(inspection: InspectionData): void {
    const container = document.createElement('div');
    container.style.cssText = `
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `;

    // Editor toolbar
    const toolbar = document.createElement('div');
    toolbar.style.cssText = `
      padding: 12px 16px;
      background: #181825;
      border-bottom: 1px solid #313244;
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    const addSectionBtn = document.createElement('button');
    addSectionBtn.textContent = '+ Add Section';
    addSectionBtn.style.cssText = `
      padding: 6px 12px;
      border: 1px solid #313244;
      border-radius: 4px;
      background: transparent;
      color: #cdd6f4;
      font-size: 12px;
      cursor: pointer;
    `;
    addSectionBtn.onclick = () => this.addSectionToInspection();
    toolbar.appendChild(addSectionBtn);

    container.appendChild(toolbar);

    // Preview area (styled like the in-game inspection panel)
    const preview = document.createElement('div');
    preview.style.cssText = `
      flex: 1;
      overflow: auto;
      padding: 24px;
      display: flex;
      justify-content: center;
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
      max-width: 500px;
      width: 100%;
      background: #181825;
      border-radius: 12px;
      border: 1px solid #313244;
      overflow: hidden;
    `;

    // Header image placeholder
    if (inspection.headerImage) {
      const headerImg = document.createElement('div');
      headerImg.style.cssText = `
        height: 150px;
        background: #313244;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #6c7086;
        font-size: 13px;
      `;
      headerImg.textContent = inspection.headerImage;
      panel.appendChild(headerImg);
    }

    // Content
    const content = document.createElement('div');
    content.style.cssText = `padding: 20px;`;

    // Title
    const title = document.createElement('h2');
    title.textContent = inspection.title;
    title.style.cssText = `
      margin: 0 0 8px 0;
      font-size: 18px;
      color: #cdd6f4;
    `;
    content.appendChild(title);

    // Subtitle
    if (inspection.subtitle) {
      const subtitle = document.createElement('div');
      subtitle.textContent = inspection.subtitle;
      subtitle.style.cssText = `
        font-size: 13px;
        color: #6c7086;
        margin-bottom: 16px;
      `;
      content.appendChild(subtitle);
    }

    // Main content
    if (inspection.content) {
      const mainText = document.createElement('p');
      mainText.textContent = inspection.content;
      mainText.style.cssText = `
        margin: 0 0 16px 0;
        font-size: 14px;
        color: #a6adc8;
        line-height: 1.6;
        white-space: pre-wrap;
      `;
      content.appendChild(mainText);
    }

    // Sections
    if (inspection.sections && inspection.sections.length > 0) {
      for (const section of inspection.sections) {
        const sectionEl = document.createElement('div');
        sectionEl.style.cssText = `
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid #313244;
        `;

        if (section.heading) {
          const heading = document.createElement('h3');
          heading.textContent = section.heading;
          heading.style.cssText = `
            margin: 0 0 8px 0;
            font-size: 14px;
            font-weight: 600;
            color: #cdd6f4;
          `;
          sectionEl.appendChild(heading);
        }

        const text = document.createElement('p');
        text.textContent = section.text;
        text.style.cssText = `
          margin: 0;
          font-size: 14px;
          color: #a6adc8;
          line-height: 1.6;
          white-space: pre-wrap;
        `;
        sectionEl.appendChild(text);

        content.appendChild(sectionEl);
      }
    }

    panel.appendChild(content);
    preview.appendChild(panel);
    container.appendChild(preview);

    this.setCenterContent(container);
  }

  private createNewInspection(): void {
    const id = `inspection-${Date.now()}`;
    const inspection: InspectionData = {
      id,
      title: 'New Document',
      subtitle: 'Subtitle',
      content: 'Enter your content here...',
    };
    this.addInspection(inspection);
    editorStore.selectEntry(id);
    this.onEntrySelect(id);
  }

  private addSectionToInspection(): void {
    if (!this.currentInspectionId) return;

    const inspection = this.inspections.get(this.currentInspectionId);
    if (!inspection) return;

    if (!inspection.sections) {
      inspection.sections = [];
    }

    inspection.sections.push({
      heading: 'New Section',
      text: 'Section content...',
    });

    editorStore.setDirty(true);
    this.renderInspectionPreview(inspection);
  }

  protected onEntrySelect(id: string): void {
    this.currentInspectionId = id;

    const inspection = this.inspections.get(id);
    if (inspection) {
      this.setInspectorData({
        id: inspection.id,
        title: inspection.title,
        subtitle: inspection.subtitle ?? '',
        headerImage: inspection.headerImage ?? '',
        content: inspection.content ?? '',
      });
      this.renderInspectionPreview(inspection);
      this.entryList.setSelected(id);
    } else {
      this.clearInspector();
      this.renderCenterPlaceholder();
    }
  }

  protected onFieldChange(key: string, value: unknown): void {
    if (!this.currentInspectionId) return;

    const inspection = this.inspections.get(this.currentInspectionId);
    if (!inspection) return;

    (inspection as unknown as Record<string, unknown>)[key] = value;
    editorStore.setDirty(true);

    this.updateEntryList();
    this.renderInspectionPreview(inspection);
  }
}
