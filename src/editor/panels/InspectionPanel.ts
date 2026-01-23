/**
 * InspectionPanel - Editor for inspectable content
 *
 * Features:
 * - Rich text editing for main content
 * - Section management with drag reordering
 * - Live preview panel (styled like in-game)
 * - Image preview for headers
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

  private renderInspectionEditor(inspection: InspectionData): void {
    const container = document.createElement('div');
    container.style.cssText = `
      flex: 1;
      display: flex;
      overflow: hidden;
    `;

    // Editor side (left)
    const editorSide = document.createElement('div');
    editorSide.style.cssText = `
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border-right: 1px solid #313244;
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

    const editorLabel = document.createElement('span');
    editorLabel.textContent = 'Content Editor';
    editorLabel.style.cssText = 'font-weight: 600; font-size: 14px; color: #cdd6f4;';
    toolbar.appendChild(editorLabel);

    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    toolbar.appendChild(spacer);

    const addSectionBtn = document.createElement('button');
    addSectionBtn.textContent = '+ Add Section';
    addSectionBtn.style.cssText = `
      padding: 6px 12px;
      border: 1px solid #a6e3a1;
      border-radius: 4px;
      background: transparent;
      color: #a6e3a1;
      font-size: 12px;
      cursor: pointer;
    `;
    addSectionBtn.onclick = () => this.addSectionToInspection(inspection);
    toolbar.appendChild(addSectionBtn);

    editorSide.appendChild(toolbar);

    // Editor content
    const editorContent = document.createElement('div');
    editorContent.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    `;

    // Header image section
    const headerSection = document.createElement('div');
    headerSection.style.cssText = `
      background: #181825;
      border-radius: 8px;
      overflow: hidden;
    `;

    const headerLabel = document.createElement('div');
    headerLabel.style.cssText = `
      padding: 12px 16px;
      background: #313244;
      font-size: 12px;
      font-weight: 500;
      color: #a6adc8;
    `;
    headerLabel.textContent = 'Header Image';
    headerSection.appendChild(headerLabel);

    const headerContent = document.createElement('div');
    headerContent.style.cssText = `
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    `;

    // Image preview
    const imagePreview = document.createElement('div');
    imagePreview.style.cssText = `
      height: 120px;
      background: #1e1e2e;
      border: 1px dashed #313244;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    `;

    if (inspection.headerImage) {
      const img = document.createElement('img');
      img.src = inspection.headerImage;
      img.style.cssText = 'max-width: 100%; max-height: 100%; object-fit: contain;';
      img.onerror = () => {
        imagePreview.innerHTML = '';
        const errorText = document.createElement('span');
        errorText.textContent = 'Image not found';
        errorText.style.cssText = 'color: #f38ba8; font-size: 12px;';
        imagePreview.appendChild(errorText);
      };
      imagePreview.appendChild(img);
    } else {
      const placeholder = document.createElement('span');
      placeholder.textContent = 'No header image';
      placeholder.style.cssText = 'color: #6c7086; font-size: 12px;';
      imagePreview.appendChild(placeholder);
    }

    headerContent.appendChild(imagePreview);

    // Image path input
    const imageInput = document.createElement('input');
    imageInput.type = 'text';
    imageInput.value = inspection.headerImage || '';
    imageInput.placeholder = '/images/header.png';
    imageInput.style.cssText = `
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #313244;
      border-radius: 4px;
      background: #1e1e2e;
      color: #cdd6f4;
      font-size: 12px;
      outline: none;
    `;
    imageInput.oninput = () => {
      inspection.headerImage = imageInput.value || undefined;
      editorStore.setDirty(true);
      this.updatePreview(inspection);
    };
    headerContent.appendChild(imageInput);

    headerSection.appendChild(headerContent);
    editorContent.appendChild(headerSection);

    // Main content section
    const contentSection = document.createElement('div');
    contentSection.style.cssText = `
      background: #181825;
      border-radius: 8px;
      overflow: hidden;
    `;

    const contentLabel = document.createElement('div');
    contentLabel.style.cssText = `
      padding: 12px 16px;
      background: #313244;
      font-size: 12px;
      font-weight: 500;
      color: #a6adc8;
    `;
    contentLabel.textContent = 'Main Content';
    contentSection.appendChild(contentLabel);

    const contentArea = document.createElement('textarea');
    contentArea.value = inspection.content || '';
    contentArea.placeholder = 'Enter the main content here...';
    contentArea.style.cssText = `
      width: 100%;
      min-height: 150px;
      padding: 16px;
      border: none;
      background: transparent;
      color: #cdd6f4;
      font-size: 14px;
      line-height: 1.6;
      resize: vertical;
      outline: none;
      font-family: inherit;
    `;
    contentArea.oninput = () => {
      inspection.content = contentArea.value || undefined;
      editorStore.setDirty(true);
      this.updatePreview(inspection);
    };
    contentSection.appendChild(contentArea);

    editorContent.appendChild(contentSection);

    // Sections
    if (inspection.sections && inspection.sections.length > 0) {
      const sectionsHeader = document.createElement('div');
      sectionsHeader.style.cssText = `
        font-size: 12px;
        font-weight: 500;
        color: #a6adc8;
        margin-top: 8px;
      `;
      sectionsHeader.textContent = 'Sections';
      editorContent.appendChild(sectionsHeader);

      for (let i = 0; i < inspection.sections.length; i++) {
        const section = inspection.sections[i]!;
        const sectionEl = this.createSectionEditor(inspection, section, i);
        editorContent.appendChild(sectionEl);
      }
    }

    editorSide.appendChild(editorContent);
    container.appendChild(editorSide);

    // Preview side (right)
    const previewSide = document.createElement('div');
    previewSide.style.cssText = `
      width: 400px;
      min-width: 350px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: #1e1e2e;
    `;

    // Preview header
    const previewHeader = document.createElement('div');
    previewHeader.style.cssText = `
      padding: 12px 16px;
      background: #181825;
      border-bottom: 1px solid #313244;
      font-size: 14px;
      font-weight: 600;
      color: #cdd6f4;
    `;
    previewHeader.textContent = 'Preview';
    previewSide.appendChild(previewHeader);

    // Preview content
    const previewContent = document.createElement('div');
    previewContent.id = 'inspection-preview';
    previewContent.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 24px;
      display: flex;
      justify-content: center;
    `;

    previewSide.appendChild(previewContent);
    container.appendChild(previewSide);

    this.setCenterContent(container);
    this.updatePreview(inspection);
  }

  private createSectionEditor(inspection: InspectionData, section: InspectionSection, index: number): HTMLElement {
    const el = document.createElement('div');
    el.style.cssText = `
      background: #181825;
      border-radius: 8px;
      overflow: hidden;
    `;

    // Section header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 8px 12px;
      background: #313244;
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    const dragHandle = document.createElement('span');
    dragHandle.textContent = '⋮⋮';
    dragHandle.style.cssText = 'color: #6c7086; cursor: grab; font-size: 12px;';
    header.appendChild(dragHandle);

    const sectionLabel = document.createElement('span');
    sectionLabel.textContent = `Section ${index + 1}`;
    sectionLabel.style.cssText = 'font-size: 12px; color: #a6adc8; flex: 1;';
    header.appendChild(sectionLabel);

    // Move buttons
    if (index > 0) {
      const moveUpBtn = document.createElement('button');
      moveUpBtn.textContent = '↑';
      moveUpBtn.style.cssText = `
        width: 24px;
        height: 24px;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: #a6adc8;
        font-size: 12px;
        cursor: pointer;
      `;
      moveUpBtn.onclick = () => this.moveSectionUp(inspection, index);
      header.appendChild(moveUpBtn);
    }

    if (inspection.sections && index < inspection.sections.length - 1) {
      const moveDownBtn = document.createElement('button');
      moveDownBtn.textContent = '↓';
      moveDownBtn.style.cssText = `
        width: 24px;
        height: 24px;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: #a6adc8;
        font-size: 12px;
        cursor: pointer;
      `;
      moveDownBtn.onclick = () => this.moveSectionDown(inspection, index);
      header.appendChild(moveDownBtn);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '✕';
    deleteBtn.style.cssText = `
      width: 24px;
      height: 24px;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: #f38ba8;
      font-size: 12px;
      cursor: pointer;
    `;
    deleteBtn.onclick = () => this.deleteSection(inspection, index);
    header.appendChild(deleteBtn);

    el.appendChild(header);

    // Section content
    const content = document.createElement('div');
    content.style.cssText = 'padding: 12px;';

    // Heading input
    const headingLabel = document.createElement('label');
    headingLabel.textContent = 'Heading (optional)';
    headingLabel.style.cssText = 'display: block; font-size: 11px; color: #6c7086; margin-bottom: 4px;';
    content.appendChild(headingLabel);

    const headingInput = document.createElement('input');
    headingInput.type = 'text';
    headingInput.value = section.heading || '';
    headingInput.placeholder = 'Section heading...';
    headingInput.style.cssText = `
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #313244;
      border-radius: 4px;
      background: #1e1e2e;
      color: #cdd6f4;
      font-size: 13px;
      margin-bottom: 12px;
      outline: none;
    `;
    headingInput.oninput = () => {
      section.heading = headingInput.value || undefined;
      editorStore.setDirty(true);
      this.updatePreview(inspection);
    };
    content.appendChild(headingInput);

    // Text input
    const textLabel = document.createElement('label');
    textLabel.textContent = 'Content';
    textLabel.style.cssText = 'display: block; font-size: 11px; color: #6c7086; margin-bottom: 4px;';
    content.appendChild(textLabel);

    const textArea = document.createElement('textarea');
    textArea.value = section.text;
    textArea.placeholder = 'Section content...';
    textArea.style.cssText = `
      width: 100%;
      min-height: 100px;
      padding: 8px 12px;
      border: 1px solid #313244;
      border-radius: 4px;
      background: #1e1e2e;
      color: #cdd6f4;
      font-size: 13px;
      line-height: 1.5;
      resize: vertical;
      outline: none;
      font-family: inherit;
    `;
    textArea.oninput = () => {
      section.text = textArea.value;
      editorStore.setDirty(true);
      this.updatePreview(inspection);
    };
    content.appendChild(textArea);

    el.appendChild(content);

    return el;
  }

  private updatePreview(inspection: InspectionData): void {
    const previewContainer = document.getElementById('inspection-preview');
    if (!previewContainer) return;

    previewContainer.innerHTML = '';

    const panel = document.createElement('div');
    panel.style.cssText = `
      max-width: 350px;
      width: 100%;
      background: #181825;
      border-radius: 12px;
      border: 1px solid #313244;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    `;

    // Header image
    if (inspection.headerImage) {
      const headerImg = document.createElement('div');
      headerImg.style.cssText = `
        height: 120px;
        background: #313244;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      `;

      const img = document.createElement('img');
      img.src = inspection.headerImage;
      img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
      img.onerror = () => {
        headerImg.innerHTML = '';
        headerImg.style.cssText += 'color: #6c7086; font-size: 12px;';
        headerImg.textContent = 'Image not found';
      };
      headerImg.appendChild(img);
      panel.appendChild(headerImg);
    }

    // Content
    const content = document.createElement('div');
    content.style.cssText = 'padding: 20px;';

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

    // Close hint
    const closeHint = document.createElement('div');
    closeHint.style.cssText = `
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid #313244;
      text-align: center;
      font-size: 12px;
      color: #6c7086;
    `;
    closeHint.textContent = 'Press ESC to close';
    content.appendChild(closeHint);

    panel.appendChild(content);
    previewContainer.appendChild(panel);
  }

  private addSectionToInspection(inspection: InspectionData): void {
    if (!inspection.sections) {
      inspection.sections = [];
    }

    inspection.sections.push({
      heading: '',
      text: '',
    });

    editorStore.setDirty(true);
    this.renderInspectionEditor(inspection);
  }

  private moveSectionUp(inspection: InspectionData, index: number): void {
    if (!inspection.sections || index <= 0) return;

    const temp = inspection.sections[index - 1]!;
    inspection.sections[index - 1] = inspection.sections[index]!;
    inspection.sections[index] = temp;

    editorStore.setDirty(true);
    this.renderInspectionEditor(inspection);
  }

  private moveSectionDown(inspection: InspectionData, index: number): void {
    if (!inspection.sections || index >= inspection.sections.length - 1) return;

    const temp = inspection.sections[index + 1]!;
    inspection.sections[index + 1] = inspection.sections[index]!;
    inspection.sections[index] = temp;

    editorStore.setDirty(true);
    this.renderInspectionEditor(inspection);
  }

  private deleteSection(inspection: InspectionData, index: number): void {
    if (!inspection.sections) return;

    const confirmed = confirm('Delete this section?');
    if (!confirmed) return;

    inspection.sections.splice(index, 1);

    editorStore.setDirty(true);
    this.renderInspectionEditor(inspection);
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

  protected onEntrySelect(id: string): void {
    this.currentInspectionId = id;

    const inspection = this.inspections.get(id);
    if (inspection) {
      this.setInspectorData({
        id: inspection.id,
        title: inspection.title,
        subtitle: inspection.subtitle ?? '',
        headerImage: inspection.headerImage ?? '',
      });
      this.renderInspectionEditor(inspection);
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
    this.updatePreview(inspection);
  }
}
