

import React, { useState, useEffect } from 'react';
import { BookOutline, AuthorProfile, KdpMarketingInfo, KdpAutomationPayload, MarketReport, Chapter, AiContentDisclosure, emptyAiContentDisclosure } from '../../types';
import * as geminiService from '../../services/geminiService';
import generateEpub from '../../services/epubGenerator';
import Card from '../shared/Card';
import Button from '../shared/Button';
import LoadingSpinner from '../shared/LoadingSpinner';
import { CameraIcon, SparklesIcon, MegaphoneIcon, XIcon, LinkedInIcon, GlobeAltIcon, DownloadIcon, ArrowPathIcon, RobotIcon, PencilSquareIcon } from '../icons';
import CopyToClipboardButton from '../shared/CopyToClipboardButton';
import CoverEditor from './review/CoverEditor';
import Modal from '../shared/Modal';

// file-saver is loaded via a <script> tag in index.html, so we access it from the window object.
const saveAs = (window as any).saveAs;

interface ReviewStepProps {
  outline: BookOutline | null;
  authorProfile: AuthorProfile | null;
  marketReport: MarketReport | null;
  onGenerateCover: () => void;
  bookCoverUrl: string | null;
  onUpdateBookCover: (newUrl: string) => void;
  isLoading: boolean;
  onHumanizeBook: () => void;
  isHumanizing: boolean;
  onGenerateKdpMarketing: () => void;
  isGeneratingKdpMarketing: boolean;
  kdpMarketingInfo: KdpMarketingInfo | null;
  onStartKdpAutomation: (payload: KdpAutomationPayload) => void;
  onRegenerateWithFeedback: (feedback: string) => void;
  isRegeneratingWithFeedback: boolean;
  onRegenerateChapter: (chapterIndex: number, currentContent: string, instructions: string) => void;
  chapterLoadingStates: { [key: number]: boolean };
}

// Simple component to render basic markdown-like text
const SimpleMarkdownRenderer: React.FC<{ text: string }> = ({ text }) => {
    if (!text) return null;
    const lines = text.split('\n');
    return (
        <div>
            {lines.map((line, index) => {
                if (line.startsWith('### ')) {
                    return <h3 key={index} className="text-xl font-semibold mt-4 mb-2">{line.substring(4)}</h3>;
                }
                if (line.startsWith('## ')) {
                    return <h2 key={index} className="text-2xl font-bold mt-6 mb-3">{line.substring(3)}</h2>;
                }
                if (line.startsWith('# ')) {
                    return <h1 key={index} className="text-3xl font-bold mt-8 mb-4">{line.substring(2)}</h1>;
                }
                if (line.startsWith('* ')) {
                    return <li key={index} className="ml-6 list-disc">{line.substring(2)}</li>;
                }
                if (line.trim() === '') {
                    return <br key={index} />;
                }
                return <p key={index} className="mb-4 last:mb-0">{line}</p>;
            })}
        </div>
    );
};

const ReviewStep: React.FC<ReviewStepProps> = ({ 
    outline, 
    authorProfile,
    marketReport, 
    onGenerateCover, 
    bookCoverUrl,
    onUpdateBookCover,
    isLoading, 
    onHumanizeBook,
    isHumanizing,
    onGenerateKdpMarketing,
    isGeneratingKdpMarketing,
    kdpMarketingInfo,
    onStartKdpAutomation,
    onRegenerateWithFeedback,
    isRegeneratingWithFeedback,
    onRegenerateChapter,
    chapterLoadingStates
}) => {
  const [displayProfile, setDisplayProfile] = useState<AuthorProfile | null>(null);
  const [isGeneratingAuthorInfo, setIsGeneratingAuthorInfo] = useState(false);
  const [isTailoringProfile, setIsTailoringProfile] = useState(false);
  const [isPreparingPackage, setIsPreparingPackage] = useState(false);
  const [isPreparingAutomation, setIsPreparingAutomation] = useState(false);
  const [regenerationFeedback, setRegenerationFeedback] = useState('');
  const [isCoverEditorOpen, setIsCoverEditorOpen] = useState(false);
  // KDP AI-content disclosure (Oct 2026 compliance) — automation is blocked until acknowledged.
  const [aiDisclosure, setAiDisclosure] = useState<AiContentDisclosure>(emptyAiContentDisclosure());

  // States for Chapter Edit Modal
  const [editingChapterIndex, setEditingChapterIndex] = useState<number | null>(null);
  const [chapterEditInstructions, setChapterEditInstructions] = useState('');

  useEffect(() => {
    // If we have a profile, we display it. The advanced AI generation happens in the AuthorProfileModal now.
    // However, we can still do a basic tailor pass if autoGenerate is true and data is missing.
    // For now, we rely on the main App state to be the source of truth, so we just mirror authorProfile.
    if (authorProfile) {
        setDisplayProfile(authorProfile);
    }
  }, [authorProfile]);

  const handleTailorProfile = async () => {
    if (!displayProfile || !outline) {
      alert("Author profile and book outline must be loaded first.");
      return;
    }

    setIsTailoringProfile(true);
    try {
      const bookTopic = `${outline.title}: ${outline.subtitle}`;

      // Create promises for both async operations
      const tailoredBioPromise = geminiService.personalizeAuthorBio(displayProfile.bio, bookTopic)
        .catch(e => {
          console.error("Failed to personalize bio:", e);
          return displayProfile.bio; // Fallback to old bio on error
        });

      // Await both promises
      const [tailoredBio] = await Promise.all([tailoredBioPromise]);

      // Update the display profile state
      setDisplayProfile(prev => {
        if (!prev) return null;
        return {
          ...prev,
          bio: tailoredBio,
        };
      });

    } catch (error) {
      console.error("Failed to tailor author profile:", error);
      alert("An error occurred while personalizing the author profile. Please check the console.");
    } finally {
      setIsTailoringProfile(false);
    }
  };

  const createPublishingGuide = (metadata: { [key: string]: string | string[] }) => {
    const guideCss = `body{font-family:sans-serif;background-color:#1e293b;color:#cbd5e1;line-height:1.6;padding:2rem}div{background-color:#334155;border:1px solid #475569;border-radius:.5rem;padding:1.5rem;margin-bottom:1.5rem}h1{color:#c4b5fd;font-size:2rem}h2{color:#818cf8;border-bottom:1px solid #475569;padding-bottom:.5rem;margin-top:2rem}code{background-color:#475569;padding:.2rem .4rem;border-radius:.3rem;font-family:monospace}button{background-color:#6d28d9;color:white;border:0;padding:.5rem .8rem;border-radius:.3rem;cursor:pointer;font-weight:600;margin-left:1rem}button:hover{background-color:#5b21b6}a{color:#a5b4fc}pre{white-space:pre-wrap;word-wrap:break-word;background-color:#0f172a;padding:1rem;border-radius:.5rem}`;
    
    let metadataHtml = '';
    for (const [key, value] of Object.entries(metadata)) {
        const id = key.toLowerCase().replace(/\s/g, '-');
        const textToCopy = Array.isArray(value) ? value.join(', ') : value;
        metadataHtml += `
            <div>
                <h3>${key}</h3>
                <code id="${id}">${textToCopy}</code>
                <button onclick="navigator.clipboard.writeText(document.getElementById('${id}').innerText)">Copy</button>
            </div>
        `;
    }

    return `
        <!DOCTYPE html><html><head><title>KDP Publishing Guide</title><style>${guideCss}</style></head><body>
        <h1>KDP Publishing Guide: ${outline?.title}</h1>
        <p>Follow these steps to publish your book on Amazon KDP. Use the copy buttons for quick and accurate data entry.</p>
        <h2>Step 1: eBook Details</h2>
        <p>Navigate to the "<a href="https://kdp.amazon.com/en_US/bookshelf" target="_blank">Kindle eBook Details</a>" tab in your KDP dashboard. Fill in the fields using the data below.</p>
        ${metadataHtml}
        <h2>Step 2: eBook Content</h2>
        <p>On the "Kindle eBook Content" tab, upload the following files:</p>
        <ul>
            <li><b>Manuscript:</b> Upload the <code>manuscript.epub</code> file.</li>
            <li><b>Cover:</b> Upload the <code>cover.jpg</code> file.</li>
        </ul>
        <h2>Step 3: Pricing</h2>
        <p>Set your pricing and royalty options on the "Kindle eBook Pricing" tab.</p>
        <p>Congratulations on your new book!</p>
        </body></html>`;
  };

  const createAndDownloadZip = async (
    bookOutline: BookOutline,
    author: AuthorProfile,
    coverUrl: string,
    marketingInfo: KdpMarketingInfo
  ) => {
    // Robustly handle JSZip instantiation using dynamic import
    let Zip;
    try {
        // Try global window.JSZip first for browser environments
        Zip = (window as any).JSZip;

        if (!Zip) {
             const JSZipModule = await import('jszip');
             Zip = (JSZipModule as any).default || JSZipModule;
             // Check if it's named export
             if (typeof Zip !== 'function' && (JSZipModule as any).JSZip) {
                 Zip = (JSZipModule as any).JSZip;
             }
        }
        
        if (typeof Zip !== 'function') {
            console.error('JSZip failed to load', Zip);
            throw new Error('JSZip failed to load');
        }
    } catch (e) {
        console.error("JSZip loading error:", e);
        alert("Failed to initialize compression library. Please refresh the page.");
        return;
    }
    
    const zip = new Zip();

    // 1. Generate EPUB
    const epubBlob = await generateEpub(bookOutline, author, coverUrl);
    zip.file("manuscript.epub", epubBlob);
    
    // 2. Add Cover Image
    const coverResponse = await fetch(coverUrl);
    const coverBlob = await coverResponse.blob();
    zip.file("cover.jpg", coverBlob);

    // 3. Add Metadata
    const metadataText = `
Title: ${bookOutline.title}
Subtitle: ${bookOutline.subtitle}
Author: ${author.name}
---
Short Description:
${marketingInfo.shortDescription}
---
Long Description (HTML):
${marketingInfo.longDescription}
---
Categories:
${marketingInfo.categories.join('\n')}
---
Keywords:
${marketingInfo.keywords.join(', ')}
    `;
    zip.file("metadata.txt", metadataText);
    
    // 4. Create and Add Publishing Guide
    const guideHtml = createPublishingGuide({
        'Title': bookOutline.title,
        'Subtitle': bookOutline.subtitle,
        'Author Name': author.name,
        'Description (HTML)': marketingInfo.longDescription,
        'Keywords': marketingInfo.keywords,
        'Categories': marketingInfo.categories,
    });
    zip.file("KDP_Publishing_Guide.html", guideHtml);


    // 5. Generate and save zip
    const content = await zip.generateAsync({ type: "blob" });
    if (saveAs) {
        saveAs(content, "kdp-publishing-kit.zip");
    } else {
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = "kdp-publishing-kit.zip";
        a.click();
    }
  };

  const handleSmartDownload = async () => {
    if (!outline || !authorProfile || !marketReport) {
        alert("An outline, author profile, and market report are needed to start the packaging process.");
        return;
    }
    setIsPreparingPackage(true);

    try {
        // --- 1. Finalize Outline ---
        let finalOutline = JSON.parse(JSON.stringify(outline));
        const findLastIndex = (arr: any[], predicate: (val: any) => boolean) => arr.map(predicate).lastIndexOf(true);
        let lastCompletedIndex = findLastIndex(finalOutline.tableOfContents, (ch: Chapter) => !!ch.content);

        if (lastCompletedIndex === -1) {
            // No content at all. Generate content for Chapter 1.
            const content = await geminiService.generateChapterContent(finalOutline.tableOfContents[0].title, finalOutline.tableOfContents[0].summary, '1-2 pages (short)');
            finalOutline.tableOfContents[0].content = content;
            lastCompletedIndex = 0;
        }
        
        const lastChapter = finalOutline.tableOfContents[lastCompletedIndex];
        
        // Only add an ending if the book is not the last chapter in the original outline
        if (lastCompletedIndex < outline.tableOfContents.length - 1) {
            const ending = await geminiService.generateQuickEnding(finalOutline.title, finalOutline.subtitle, lastChapter.content);
            lastChapter.content += `\n\n${ending}`;
        }
        
        finalOutline.tableOfContents = finalOutline.tableOfContents.slice(0, lastCompletedIndex + 1);

        // --- 2. Ensure Cover ---
        let finalCoverUrl = bookCoverUrl;
        if (!finalCoverUrl) {
            if (!authorProfile.name) {
                alert("Please add an author name to your profile to generate a cover.");
                setIsPreparingPackage(false);
                return;
            }
            finalCoverUrl = await geminiService.generateBookCover(finalOutline.title, finalOutline.subtitle, authorProfile.name);
        }

        // --- 3. Ensure Marketing Info ---
        let finalMarketingInfo = kdpMarketingInfo;
        if (!finalMarketingInfo) {
            finalMarketingInfo = await geminiService.generateKdpMarketingInfo(marketReport, finalOutline);
        }
        
        // --- 4. Get final author profile ---
        const finalAuthorProfile = displayProfile || authorProfile;

        // --- 5. Package everything ---
        await createAndDownloadZip(finalOutline, finalAuthorProfile, finalCoverUrl, finalMarketingInfo);

    } catch (e) {
        console.error("Failed to create smart package:", e);
        alert("An error occurred while preparing your package. Please check the console.");
    } finally {
        setIsPreparingPackage(false);
    }
  };

  const handleStartAutomation = async () => {
    if (!outline || !displayProfile || !bookCoverUrl || !kdpMarketingInfo) {
      alert("Cannot start automation. Ensure cover, marketing, and author info are finalized.");
      return;
    }
    if (!aiDisclosure.acknowledged) {
      alert("KDP AI-content disclosure is required: confirm your answers below before automating publication. Publishing AI-generated content without disclosure risks title removal and account suspension.");
      return;
    }
    setIsPreparingAutomation(true);
    try {
      const epubBlob = await generateEpub(outline, displayProfile, bookCoverUrl);
      onStartKdpAutomation({
        outline,
        kdpMarketingInfo,
        authorProfile: displayProfile,
        epubBlob,
        coverImageUrl: bookCoverUrl,
        aiDisclosure,
      });
    } catch (e) {
      console.error("Failed to prepare data for automation:", e);
      alert("An error occurred while preparing your book for automation.");
    } finally {
      setIsPreparingAutomation(false);
    }
  };

  const handleOpenEditModal = (index: number) => {
      setEditingChapterIndex(index);
      setChapterEditInstructions('');
  };

  const handleSubmitEdit = () => {
      if (editingChapterIndex !== null && outline) {
          const chapter = outline.tableOfContents[editingChapterIndex];
          if (chapter.content) {
             onRegenerateChapter(editingChapterIndex, chapter.content, chapterEditInstructions);
             setEditingChapterIndex(null); // Close modal immediately, UI updates with loading state
          }
      }
  };

  if (!outline) {
    return <Card><p>No book generated yet. Please go through the steps.</p></Card>;
  }

  const canGenerateCover = !!(outline && authorProfile?.name);
  const isPublishingReady = !!(bookCoverUrl && kdpMarketingInfo && displayProfile);
  const isAnyMajorActionRunning = isHumanizing || isRegeneratingWithFeedback;

  return (
    <div className="w-full max-w-4xl mx-auto">
      {isCoverEditorOpen && (
        <Modal onClose={() => setIsCoverEditorOpen(false)}>
            <CoverEditor 
                initialImageUrl={bookCoverUrl}
                title={outline.title}
                authorName={authorProfile?.name || ''}
                onSave={(newCoverUrl) => {
                    onUpdateBookCover(newCoverUrl);
                    setIsCoverEditorOpen(false);
                }}
            />
        </Modal>
      )}
      
      {editingChapterIndex !== null && (
          <Modal onClose={() => setEditingChapterIndex(null)}>
               <div className="w-full max-w-2xl bg-slate-800 p-0 rounded-lg overflow-hidden border border-emerald-500/50 shadow-2xl">
                    <div className="bg-slate-900 p-6 border-b border-slate-700 flex justify-between items-center">
                        <div>
                            <h3 className="text-2xl font-bold text-emerald-400 font-serif flex items-center gap-2">
                                <PencilSquareIcon className="w-6 h-6" />
                                Surgical Edit Mode
                            </h3>
                            <p className="text-sm text-slate-300">Edit Chapter {outline.tableOfContents[editingChapterIndex].chapter} with specific instructions.</p>
                        </div>
                         <button onClick={() => setEditingChapterIndex(null)} className="text-slate-400 hover:text-white transition-colors">
                            <XIcon className="w-6 h-6" />
                        </button>
                    </div>
                    <div className="p-6 space-y-4">
                        <div className="bg-emerald-900/20 p-4 rounded-md border-l-4 border-emerald-500">
                             <p className="text-sm text-slate-300">
                                <span className="font-bold text-emerald-400">System Note:</span> The AI will apply your requested changes while keeping the rest of the text exactly as it is, unless flow requires adjustment.
                             </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-200 mb-2">
                                What needs to change?
                            </label>
                            <textarea
                                value={chapterEditInstructions}
                                onChange={(e) => setChapterEditInstructions(e.target.value)}
                                className="w-full h-40 p-4 bg-slate-900 border border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-200 resize-none"
                                placeholder="e.g., 'Rewrite the second paragraph to be more suspenseful. Change the dialog tag 'said' to 'whispered' in the final scene. Leave everything else unchanged.'"
                            />
                        </div>
                    </div>
                    <div className="p-4 bg-slate-900/80 border-t border-slate-700 flex justify-end gap-3">
                         <Button variant="secondary" onClick={() => setEditingChapterIndex(null)}>Cancel</Button>
                         <Button onClick={handleSubmitEdit} disabled={!chapterEditInstructions.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                            <SparklesIcon className="w-5 h-5" />
                            Apply Changes
                         </Button>
                    </div>
                </div>
          </Modal>
      )}

      <Card>
        <h2 className="text-3xl font-bold text-center text-violet-400 mb-2 font-serif">Step 5: Review & Publish</h2>
        <p className="text-slate-400 text-center mb-8">
          Here is your completed manuscript and cover. Finalize and download your KDP Publishing Kit.
        </p>
        
        {/* Book Cover Section */}
        <Card className="mb-8 bg-slate-900/50">
            <h3 className="text-2xl font-bold text-emerald-400 mb-4 font-serif text-center">Book Cover</h3>
            <div className="flex flex-col items-center gap-6">
                <div className="w-60 h-80 bg-slate-700 rounded-md flex items-center justify-center overflow-hidden shadow-lg border-4 border-slate-600">
                    {isLoading && !bookCoverUrl ? (
                        <LoadingSpinner message="Designing..." />
                    ) : bookCoverUrl ? (
                        <img src={bookCoverUrl} alt="Generated book cover" className="w-full h-full object-cover" />
                    ) : (
                        <div className="text-center text-slate-500">
                            <CameraIcon className="w-16 h-16 mx-auto" />
                            <p className="text-sm mt-2">Your cover will appear here</p>
                        </div>
                    )}
                </div>
                <div className="flex gap-2">
                    <Button 
                      onClick={onGenerateCover} 
                      disabled={!canGenerateCover || isLoading}
                    >
                        <CameraIcon className="w-5 h-5" />
                        {isLoading ? "Generating..." : (bookCoverUrl ? "Regenerate" : "Generate Cover")}
                    </Button>
                    <Button onClick={() => setIsCoverEditorOpen(true)} disabled={!bookCoverUrl} variant="secondary">
                        <PencilSquareIcon className="w-5 h-5" />
                        Edit Cover
                    </Button>
                </div>
                {!canGenerateCover && <p className="text-xs text-slate-500 text-center mt-2">Please complete your Author Profile with a name to generate a cover.</p>}
            </div>
        </Card>

        {/* Manuscript Actions */}
        <Card className="mb-8 bg-slate-900/50">
            <h3 className="text-2xl font-bold text-emerald-400 mb-4 font-serif text-center">Final Touches</h3>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
                 <Button onClick={onHumanizeBook} disabled={isAnyMajorActionRunning}>
                    {isHumanizing ? (
                        <>
                            <LoadingSpinner size="sm" />
                            Humanizing...
                        </>
                    ) : (
                        <>
                            <SparklesIcon className="w-5 h-5" />
                            Humanize Manuscript
                        </>
                    )}
                 </Button>
            </div>
             {isHumanizing && <p className="text-xs text-slate-500 text-center mt-2">This may take a few moments...</p>}
            
            <div className="mt-6 pt-6 border-t border-slate-700">
                <h4 className="font-semibold text-violet-400 text-center">Regenerate with Feedback</h4>
                 <p className="text-xs text-slate-400 text-center mb-4">Provide notes to the AI Grand Master for a complete rewrite of the manuscript.</p>
                <textarea
                    value={regenerationFeedback}
                    onChange={(e) => setRegenerationFeedback(e.target.value)}
                    className="w-full h-24 p-2 bg-slate-800 border border-slate-600 rounded-md resize-y text-slate-300"
                    placeholder="e.g., 'Make Chapter 3 more dramatic, keep the tone of Chapter 5, and change the protagonist's motivation.'"
                    disabled={isAnyMajorActionRunning}
                />
                <div className="flex justify-center mt-2">
                    <Button onClick={() => onRegenerateWithFeedback(regenerationFeedback)} disabled={!regenerationFeedback || isAnyMajorActionRunning}>
                        {isRegeneratingWithFeedback ? (
                            <>
                                <LoadingSpinner size="sm" />
                                Regenerating...
                            </>
                        ) : (
                            <>
                                <ArrowPathIcon className="w-5 h-5" />
                                Regenerate Full Manuscript
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </Card>
        
        {/* KDP Marketing Suite */}
        <Card className="mb-8 bg-slate-900/50">
            <div className="flex justify-center items-center gap-4 mb-4 text-center">
              <h3 className="text-2xl font-bold text-emerald-400 font-serif">KDP Marketing Suite</h3>
              {kdpMarketingInfo && !isGeneratingKdpMarketing && (
                  <Button onClick={onGenerateKdpMarketing} variant="secondary" className="px-2 py-1" title="Regenerate Marketing Materials">
                      <ArrowPathIcon className="w-5 h-5" />
                  </Button>
              )}
            </div>
            
            {isGeneratingKdpMarketing ? (
                <LoadingSpinner message="Generating marketing materials..." />
            ) : kdpMarketingInfo ? (
                <div className="space-y-6">
                    {kdpMarketingInfo.backCoverBlurb && (
                        <div>
                            <div className="flex justify-between items-center">
                                <h4 className="font-semibold text-violet-400">Back Cover Critic Review</h4>
                                <CopyToClipboardButton textToCopy={kdpMarketingInfo.backCoverBlurb} />
                            </div>
                            <div className="text-sm text-slate-300 bg-slate-800 p-4 rounded-md mt-1 italic border-l-4 border-violet-500">
                                <SimpleMarkdownRenderer text={kdpMarketingInfo.backCoverBlurb} />
                            </div>
                        </div>
                    )}
                    <div>
                        <div className="flex justify-between items-center">
                            <h4 className="font-semibold text-violet-400">Short Description</h4>
                            <CopyToClipboardButton textToCopy={kdpMarketingInfo.shortDescription} />
                        </div>
                        <p className="text-sm text-slate-300 bg-slate-800 p-3 rounded-md mt-1">{kdpMarketingInfo.shortDescription}</p>
                    </div>
                    <div>
                        <div className="flex justify-between items-center">
                            <h4 className="font-semibold text-violet-400">Long Description (HTML)</h4>
                            <CopyToClipboardButton textToCopy={kdpMarketingInfo.longDescription} />
                        </div>
                        <div 
                            className="text-sm text-slate-300 bg-slate-800 p-3 rounded-md mt-1 prose prose-sm prose-invert max-w-none"
                            dangerouslySetInnerHTML={{ __html: kdpMarketingInfo.longDescription }}
                        />
                    </div>
                     <div>
                        <div className="flex justify-between items-center">
                            <h4 className="font-semibold text-violet-400">KDP Categories</h4>
                             <CopyToClipboardButton textToCopy={kdpMarketingInfo.categories.join('\n')} />
                        </div>
                        <ul className="text-sm text-slate-300 bg-slate-800 p-3 rounded-md mt-1 list-disc list-inside">
                            {kdpMarketingInfo.categories.map((cat, i) => <li key={i}>{cat}</li>)}
                        </ul>
                    </div>
                    <div>
                        <div className="flex justify-between items-center">
                             <h4 className="font-semibold text-violet-400">7 Backend Keywords</h4>
                             <CopyToClipboardButton textToCopy={kdpMarketingInfo.keywords.join(', ')} />
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {kdpMarketingInfo.keywords.map((kw, i) => <span key={i} className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full">{kw}</span>)}
                        </div>
                    </div>
                </div>
            ) : (
                 <div className="flex flex-col items-center gap-4">
                    <Button onClick={onGenerateKdpMarketing} disabled={isGeneratingKdpMarketing}>
                        <MegaphoneIcon className="w-5 h-5" />
                        Generate Marketing Materials
                    </Button>
                 </div>
            )}
        </Card>

        {/* Publishing Toolkit */}
        <Card className="mb-8 bg-gradient-to-br from-violet-900/80 to-emerald-900/50 border-violet-600">
             <h3 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-300 to-emerald-300 mb-4 font-serif text-center">Publishing Toolkit</h3>
             <p className="text-slate-300 text-center mb-6 max-w-2xl mx-auto">
                Your book is ready. Download the complete KDP package or deploy our Automation Bot to publish it for you.
             </p>
             {/* KDP AI-content disclosure (Oct 2026 compliance) */}
             <div className="max-w-2xl mx-auto mb-6 rounded-lg border border-amber-500/40 bg-amber-950/30 p-4">
                <h4 className="text-sm font-bold text-amber-300 mb-1">KDP AI-Content Disclosure — required</h4>
                <p className="text-xs text-slate-300 mb-3">
                  Amazon requires disclosure when AI <em>generated</em> your text, images, or translations —
                  including covers, even after heavy editing. AI-<em>assisted</em> content needs no disclosure.
                  Publishing AI-generated content without disclosure risks title removal; repeat offenses risk
                  account suspension.
                </p>
                <div className="space-y-2 text-sm text-slate-200">
                  {([
                    ['aiGeneratedText', 'AI generated any of the book\u2019s text'],
                    ['aiGeneratedImages', 'AI generated the cover or interior images'],
                    ['aiGeneratedTranslations', 'AI generated a translation of the book'],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={aiDisclosure[key]}
                        onChange={(e) => setAiDisclosure({ ...aiDisclosure, [key]: e.target.checked, acknowledged: false })}
                        className="w-4 h-4 accent-amber-500"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <label className="flex items-start gap-2 cursor-pointer mt-3 pt-3 border-t border-amber-500/30 text-sm text-slate-100">
                  <input
                    type="checkbox"
                    checked={aiDisclosure.acknowledged}
                    onChange={(e) => setAiDisclosure({ ...aiDisclosure, acknowledged: e.target.checked })}
                    className="w-4 h-4 mt-0.5 accent-emerald-500"
                  />
                  <span>I confirm these answers are accurate and may be submitted to KDP on my behalf.</span>
                </label>
             </div>
             <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
                 <Button 
                    onClick={handleSmartDownload} 
                    disabled={!outline || !authorProfile || isPreparingPackage || isPreparingAutomation} 
                    variant="secondary"
                    className="px-8 py-3 text-lg"
                 >
                    {isPreparingPackage ? (
                        <>
                            <LoadingSpinner size="sm" />
                            Preparing Kit...
                        </>
                    ) : (
                        <>
                            <DownloadIcon className="w-6 h-6" />
                            Download KDP Publishing Kit
                        </>
                    )}
                 </Button>
                  <Button 
                    onClick={handleStartAutomation} 
                    disabled={!isPublishingReady || isPreparingPackage || isPreparingAutomation}
                    className="px-8 py-3 text-lg"
                 >
                     {isPreparingAutomation ? (
                        <>
                            <LoadingSpinner size="sm" />
                            Preparing Bot...
                        </>
                     ) : (
                        <>
                            <RobotIcon className="w-6 h-6" />
                            Automate KDP Publishing
                        </>
                     )}
                 </Button>
             </div>
             <p className="text-xs text-slate-400 text-center mt-3">If any content or assets are missing, the AI will generate them before packaging.</p>
        </Card>


        <div className="bg-slate-900/50 p-6 sm:p-8 rounded-lg prose prose-invert max-w-none prose-headings:font-serif">
            <h1 className="text-4xl text-center font-bold !mb-2">{outline.title}</h1>
            <p className="text-center text-lg text-slate-400 italic !mt-0">{outline.subtitle}</p>

            <div className="mt-12 space-y-10">
                
                {/* Book Content */}
                {outline.tableOfContents && outline.tableOfContents.map((chapter, index) => (
                    <div key={index} className="page-break-before relative group">
                        <div className="flex items-center justify-between border-b border-slate-700 pb-2 mb-6">
                            <h2 className="text-3xl font-bold">{chapter.chapter}. {chapter.title}</h2>
                            <Button 
                                onClick={() => handleOpenEditModal(index)} 
                                variant="secondary" 
                                className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 text-sm py-1"
                                disabled={chapterLoadingStates[chapter.chapter]}
                            >
                                {chapterLoadingStates[chapter.chapter] ? (
                                    <LoadingSpinner size="sm"/> 
                                ) : (
                                    <>
                                        <PencilSquareIcon className="w-4 h-4"/> 
                                        Edit with AI
                                    </>
                                )}
                            </Button>
                        </div>
                        
                        {chapter.imageUrl && (
                            <div className="my-8 flex justify-center">
                                <img src={chapter.imageUrl} alt={`Illustration for ${chapter.title}`} className="rounded-lg shadow-lg max-w-sm w-full" />
                            </div>
                        )}

                        {chapter.content ? (
                            <div className={chapterLoadingStates[chapter.chapter] ? "opacity-50 animate-pulse" : ""}>
                                <SimpleMarkdownRenderer text={chapter.content} />
                                {displayProfile?.marketing?.ctaText && displayProfile.marketing.ctaUrl && displayProfile.marketing.includeInEpub && (
                                    <div className="mt-8 pt-6 border-t border-slate-700/50 text-center opacity-80">
                                        <a 
                                            href={displayProfile.marketing.ctaUrl} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="inline-block bg-violet-600 text-white px-6 py-2 rounded-full font-bold hover:bg-violet-700 transition-colors no-underline"
                                        >
                                            {displayProfile.marketing.ctaText}
                                        </a>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-slate-500 italic">Content not generated for this chapter.</p>
                        )}
                    </div>
                ))}
                
                {/* About the Author Section - INSIDE BACK COVER */}
                {displayProfile && (
                    <div className="page-break-before pt-12 border-t-2 border-slate-600">
                        <h2 className="text-3xl font-bold text-center mb-8">About the Author</h2>
                        
                        <div className="flex flex-col md:flex-row gap-8 items-start not-prose">
                            {/* Author Photos Column */}
                            <div className="w-full md:w-1/3 flex flex-col gap-4">
                                {displayProfile.photo?.base64 && (
                                    <div className="text-center">
                                        <img src={displayProfile.photo.base64} alt={displayProfile.name} className="w-full rounded-lg shadow-lg object-cover aspect-square" />
                                        <p className="text-xs text-slate-500 mt-2">Author Portrait</p>
                                    </div>
                                )}
                                {displayProfile.actionPhoto?.base64 && (
                                    <div className="text-center">
                                        <img src={displayProfile.actionPhoto.base64} alt={`${displayProfile.name} Lifestyle`} className="w-full rounded-lg shadow-lg object-cover aspect-square grayscale hover:grayscale-0 transition-all duration-500" />
                                        <p className="text-xs text-slate-500 mt-2">Life behind the scenes</p>
                                    </div>
                                )}
                            </div>

                            {/* Author Details Column */}
                            <div className="w-full md:w-2/3 text-slate-300">
                                <h3 className="text-4xl font-bold font-serif text-violet-400 mb-2">{displayProfile.name}</h3>
                                {displayProfile.birthday && <p className="text-sm text-slate-400 mb-4">Born: {displayProfile.birthday}</p>}
                                
                                <div className="prose prose-lg prose-invert max-w-none mb-6">
                                    <SimpleMarkdownRenderer text={displayProfile.bio} />
                                </div>

                                {displayProfile.expertise && (
                                    <div className="bg-slate-800 p-4 rounded-lg mb-6 border-l-4 border-emerald-500">
                                        <h4 className="font-bold text-white mb-1">Expertise & Background</h4>
                                        <p className="text-sm italic">{displayProfile.expertise}</p>
                                    </div>
                                )}
                                
                                {/* Social Media Links */}
                                <div className="flex flex-wrap gap-4 mb-8">
                                    {displayProfile.socialMedia?.twitter && (
                                        <a href={displayProfile.socialMedia.twitter} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
                                            <XIcon className="w-5 h-5"/> <span>Twitter</span>
                                        </a>
                                    )}
                                    {displayProfile.socialMedia?.linkedin && (
                                        <a href={displayProfile.socialMedia.linkedin} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
                                            <LinkedInIcon className="w-5 h-5"/> <span>LinkedIn</span>
                                        </a>
                                    )}
                                    {displayProfile.socialMedia?.website && (
                                        <a href={displayProfile.socialMedia.website} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
                                            <GlobeAltIcon className="w-5 h-5"/> <span>Website</span>
                                        </a>
                                    )}
                                     {displayProfile.socialMedia?.facebook && (
                                        <a href={displayProfile.socialMedia.facebook} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
                                            <span className="font-bold">f</span> <span>Facebook</span>
                                        </a>
                                    )}
                                     {displayProfile.socialMedia?.instagram && (
                                        <a href={displayProfile.socialMedia.instagram} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
                                            <span className="font-bold">Ig</span> <span>Instagram</span>
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
      </Card>
    </div>
  );
};

export default ReviewStep;