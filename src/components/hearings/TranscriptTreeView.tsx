import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen } from 'lucide-react';
import type { TranscriptListItem } from '../../types/hearings';
import { formatDateShort, formatDuration } from '../../lib/formatUtils';
import { committeeToSlug } from '../../lib/transcriptUtils';

interface TranscriptTreeViewProps {
    transcripts: TranscriptListItem[];
}

// Tree node structure for hierarchical organization
interface TreeNode {
    type: 'billType' | 'committee' | 'bill' | 'transcript';
    id: string;
    label: string;
    children?: TreeNode[];
    transcript?: TranscriptListItem;
}

/**
 * TranscriptTreeView Component
 * 
 * Displays transcripts in a hierarchical tree structure organized by:
 * Year → Bill Type (HB/SB) → Committee → Bill → Individual Transcripts
 * 
 * Provides expand/collapse functionality for easy navigation.
 */
const TranscriptTreeView: React.FC<TranscriptTreeViewProps> = ({ transcripts }) => {
    const [selectedYear, setSelectedYear] = useState<string>('');
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
    const [isAllExpanded, setIsAllExpanded] = useState<boolean>(false);

    // Extract unique years from transcripts
    const availableYears = useMemo(() => {
        const years = new Set(transcripts.map(t => t.year));
        return Array.from(years).sort((a, b) => b.localeCompare(a));
    }, [transcripts]);

    // Set default year to the most recent
    useMemo(() => {
        if (availableYears.length > 0 && !selectedYear) {
            setSelectedYear(availableYears[0]);
        }
    }, [availableYears, selectedYear]);

    // Build tree structure from transcripts
    const treeData = useMemo(() => {
        const filteredTranscripts = selectedYear
            ? transcripts.filter(t => t.year === selectedYear)
            : transcripts;

        const tree: { [billType: string]: { [committee: string]: { [billName: string]: TranscriptListItem[] } } } = {};

        filteredTranscripts.forEach(transcript => {
            // Determine bill type (HB or SB) from bill_name
            const billType = transcript.bill_name.match(/^(HB|SB)/)?.[1] || 'OTHER';
            const committeeKey = Array.isArray(transcript.committee) ? transcript.committee.join('-') : transcript.committee;
            const committeeLabel = Array.isArray(transcript.committee) ? transcript.committee.join(', ') : transcript.committee;

            if (!tree[billType]) tree[billType] = {};
            if (!tree[billType][committeeKey]) tree[billType][committeeKey] = {};
            if (!tree[billType][committeeKey][transcript.bill_name]) {
                tree[billType][committeeKey][transcript.bill_name] = [];
            }

            const t = { ...transcript, committee: committeeLabel } as TranscriptListItem;
            tree[billType][committeeKey][transcript.bill_name].push(t);
        });

        // Convert to tree nodes
        const nodes: TreeNode[] = [];

        Object.entries(tree).sort(([a], [b]) => a.localeCompare(b)).forEach(([billType, committees]) => {
            const billTypeNode: TreeNode = {
                type: 'billType',
                id: `billType-${billType}`,
                label: billType === 'HB' ? 'House Bills (HB)' : billType === 'SB' ? 'Senate Bills (SB)' : 'Other Bills',
                children: []
            };

            Object.entries(committees).sort(([a], [b]) => a.localeCompare(b)).forEach(([committee, bills]) => {
                const committeeNode: TreeNode = {
                    type: 'committee',
                    id: `committee-${billType}-${committee}`,
                    label: committee,
                    children: []
                };

                Object.entries(bills).sort(([a], [b]) => a.localeCompare(b)).forEach(([billName, transcriptList]) => {
                    const billNode: TreeNode = {
                        type: 'bill',
                        id: `bill-${billType}-${committee}-${billName}`,
                        label: billName,
                        children: []
                    };

                    transcriptList
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .forEach((transcript, idx) => {
                            billNode.children!.push({
                                type: 'transcript',
                                id: `transcript-${transcript.hearing_id}-${idx}`,
                                label: transcript.video_title || transcript.title,
                                transcript
                            });
                        });

                    committeeNode.children!.push(billNode);
                });

                billTypeNode.children!.push(committeeNode);
            });

            nodes.push(billTypeNode);
        });

        return nodes;
    }, [transcripts, selectedYear]);

    const toggleNode = (nodeId: string) => {
        setExpandedNodes(prev => {
            const newSet = new Set(prev);
            if (newSet.has(nodeId)) {
                newSet.delete(nodeId);
            } else {
                newSet.add(nodeId);
            }
            return newSet;
        });
    };

    const expandAll = () => {
        const allNodeIds = new Set<string>();
        const collectIds = (nodes: TreeNode[]) => {
            nodes.forEach(node => {
                allNodeIds.add(node.id);
                if (node.children) {
                    collectIds(node.children);
                }
            });
        };
        collectIds(treeData);
        setExpandedNodes(allNodeIds);
        setIsAllExpanded(true);
    };

    const collapseAll = () => {
        setExpandedNodes(new Set());
        setIsAllExpanded(false);
    };

    const toggleExpandCollapseAll = () => {
        if (isAllExpanded) {
            collapseAll();
        } else {
            expandAll();
        }
    };

    const renderNode = (node: TreeNode, depth: number = 0): React.ReactNode => {
        const isExpanded = expandedNodes.has(node.id);
        const hasChildren = node.children && node.children.length > 0;

        if (node.type === 'transcript' && node.transcript) {
            return (
                <div
                    key={node.id}
                    className="flex items-center py-2 hover:bg-gray-50 border-b border-gray-100"
                    style={{ paddingLeft: `${16 + (depth * 32)}px`, paddingRight: '16px' }}
                >
                    <FileText className="w-4 h-4 text-gray-400 mr-3 flex-shrink-0" />
                    <div className="flex-1 flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">
                                {node.transcript.title}
                            </div>
                            <div className="text-xs text-gray-500 flex items-center gap-3 mt-1">
                                <span>{formatDateShort(node.transcript.date)}</span>
                                <span>•</span>
                                <span>{formatDuration(node.transcript.duration)}</span>
                                {node.transcript.room && (
                                    <>
                                        <span>•</span>
                                        <span>{node.transcript.room} {node.transcript.ampm}</span>
                                    </>
                                )}
                            </div>
                        </div>
                        <Link
                            to={`/hearing/${node.transcript.year}/${committeeToSlug(node.transcript.committee)}/${node.transcript.bill_name}/${node.transcript.video_title}`}
                            className="text-blue-600 hover:text-blue-800 underline text-sm font-medium whitespace-nowrap flex-shrink-0"
                        >
                            View Analysis
                        </Link>
                    </div>
                </div>
            );
        }

        return (
            <div key={node.id}>
                <div
                    className={`flex items-center py-2.5 cursor-pointer hover:bg-gray-50 border-b border-gray-100 ${
                        node.type === 'billType' ? 'bg-gray-50 font-semibold' : ''
                    }`}
                    style={{ paddingLeft: `${16 + (depth * 32)}px`, paddingRight: '16px' }}
                    onClick={() => hasChildren && toggleNode(node.id)}
                >
                    {hasChildren && (
                        <div className="mr-2">
                            {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-gray-600" />
                            ) : (
                                <ChevronRight className="w-4 h-4 text-gray-600" />
                            )}
                        </div>
                    )}
                    {!hasChildren && <div className="w-4 mr-2" />}
                    
                    {node.type !== 'transcript' && (
                        <>
                            {isExpanded ? (
                                <FolderOpen className="w-4 h-4 text-blue-500 mr-3" />
                            ) : (
                                <Folder className="w-4 h-4 text-gray-400 mr-3" />
                            )}
                        </>
                    )}
                    
                    <span className={`text-sm ${
                        node.type === 'billType' 
                            ? 'font-semibold text-gray-900' 
                            : node.type === 'committee'
                            ? 'font-medium text-gray-800'
                            : node.type === 'bill'
                            ? 'font-medium text-gray-700'
                            : 'text-gray-700'
                    }`}>
                        {node.label}
                    </span>
                    
                    {hasChildren && (
                        <span className="ml-2 text-xs text-gray-500">
                            ({node.children!.length})
                        </span>
                    )}
                </div>
                
                {isExpanded && hasChildren && (
                    <div>
                        {node.children!.map(child => renderNode(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="bg-white border rounded-lg shadow-sm">
            {/* Header with Year Selector */}
            <div className="border-b bg-gray-50 p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <label htmlFor="yearSelect" className="text-sm font-medium text-gray-700">
                            Legislative Session:
                        </label>
                        <select
                            id="yearSelect"
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(e.target.value)}
                            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            {availableYears.map(year => (
                                <option key={year} value={year}>
                                    {year}
                                </option>
                            ))}
                        </select>
                    </div>
                    
                    <button
                        onClick={toggleExpandCollapseAll}
                        className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-100 transition-colors"
                    >
                        {isAllExpanded ? 'Collapse All' : 'Expand All'}
                    </button>
                </div>
            </div>

            {/* Tree View */}
            <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
                {treeData.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <p>No transcripts found for {selectedYear}</p>
                    </div>
                ) : (
                    <div>
                        {treeData.map(node => renderNode(node))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default TranscriptTreeView;
