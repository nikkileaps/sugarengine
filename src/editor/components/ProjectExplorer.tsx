/**
 * ProjectExplorer - Dialog for browsing and selecting projects/episodes
 * Shows a tree view of seasons/episodes
 */

import { Modal, Stack, Text, Button, Group, TextInput, ScrollArea, ActionIcon } from '@mantine/core';
import { useState } from 'react';

interface Season {
  id: string;
  name: string;
  order: number;
}

interface Episode {
  id: string;
  seasonId: string;
  name: string;
  order: number;
  startRegion?: string;
}

interface ProjectExplorerProps {
  opened: boolean;
  onClose: () => void;
  seasons: Season[];
  episodes: Episode[];
  onSeasonsChange: (seasons: Season[]) => void;
  onEpisodesChange: (episodes: Episode[]) => void;
  onOpenEpisode: (seasonId: string, episodeId: string) => void;
}

export function ProjectExplorer({
  opened,
  onClose,
  seasons,
  episodes,
  onSeasonsChange,
  onEpisodesChange,
  onOpenEpisode,
}: ProjectExplorerProps) {
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);
  const [editingSeasonId, setEditingSeasonId] = useState<string | null>(null);
  const [editingSeasonName, setEditingSeasonName] = useState('');

  const sortedSeasons = [...seasons].sort((a, b) => a.order - b.order);
  const seasonEpisodes = selectedSeasonId
    ? episodes.filter((e) => e.seasonId === selectedSeasonId).sort((a, b) => a.order - b.order)
    : [];

  const handleAddSeason = () => {
    const order = seasons.length + 1;
    const newSeason: Season = {
      id: crypto.randomUUID(),
      name: `Season ${order}`,
      order,
    };
    onSeasonsChange([...seasons, newSeason]);
    setSelectedSeasonId(newSeason.id);
    setSelectedEpisodeId(null);
  };

  const handleAddEpisode = () => {
    if (!selectedSeasonId) return;
    const existingCount = episodes.filter((e) => e.seasonId === selectedSeasonId).length;
    const newEpisode: Episode = {
      id: crypto.randomUUID(),
      seasonId: selectedSeasonId,
      name: `Episode ${existingCount + 1}`,
      order: existingCount + 1,
    };
    onEpisodesChange([...episodes, newEpisode]);
    setSelectedEpisodeId(newEpisode.id);
  };

  const handleDeleteSeason = (seasonId: string) => {
    const seasonEps = episodes.filter((e) => e.seasonId === seasonId);
    if (seasonEps.length > 0) {
      if (!confirm(`Delete this season and its ${seasonEps.length} episode(s)?`)) return;
    } else {
      if (!confirm('Delete this season?')) return;
    }
    onSeasonsChange(seasons.filter((s) => s.id !== seasonId));
    onEpisodesChange(episodes.filter((e) => e.seasonId !== seasonId));
    if (selectedSeasonId === seasonId) {
      setSelectedSeasonId(null);
      setSelectedEpisodeId(null);
    }
  };

  const handleDeleteEpisode = (episodeId: string) => {
    if (!confirm('Delete this episode?')) return;
    onEpisodesChange(episodes.filter((e) => e.id !== episodeId));
    if (selectedEpisodeId === episodeId) {
      setSelectedEpisodeId(null);
    }
  };

  const handleOpenEpisode = () => {
    if (selectedSeasonId && selectedEpisodeId) {
      onOpenEpisode(selectedSeasonId, selectedEpisodeId);
      onClose();
    }
  };

  const startEditingSeason = (season: Season) => {
    setEditingSeasonId(season.id);
    setEditingSeasonName(season.name);
  };

  const saveSeasonName = () => {
    if (editingSeasonId && editingSeasonName.trim()) {
      onSeasonsChange(
        seasons.map((s) =>
          s.id === editingSeasonId ? { ...s, name: editingSeasonName.trim() } : s
        )
      );
    }
    setEditingSeasonId(null);
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Project Explorer"
      size="md"
      centered
      styles={{
        header: { background: '#1e1e2e', borderBottom: '1px solid #313244' },
        title: { color: '#cdd6f4', fontWeight: 600 },
        body: { background: '#1e1e2e', padding: 0 },
        content: { background: '#1e1e2e' },
        close: { color: '#6c7086', '&:hover': { background: '#313244' } },
      }}
    >
      <Group align="stretch" gap={0} style={{ height: 350 }}>
        {/* Seasons Panel */}
        <Stack gap={0} style={{ width: 180, borderRight: '1px solid #313244' }}>
          <Group justify="space-between" p="xs" style={{ borderBottom: '1px solid #313244' }}>
            <Text size="xs" c="dimmed" fw={600}>SEASONS</Text>
            <ActionIcon size="xs" variant="subtle" onClick={handleAddSeason}>+</ActionIcon>
          </Group>
          <ScrollArea style={{ flex: 1 }}>
            <Stack gap={2} p="xs">
              {sortedSeasons.map((season) => (
                <Group key={season.id} gap={4}>
                  {editingSeasonId === season.id ? (
                    <TextInput
                      size="xs"
                      value={editingSeasonName}
                      onChange={(e) => setEditingSeasonName(e.currentTarget.value)}
                      onBlur={saveSeasonName}
                      onKeyDown={(e) => e.key === 'Enter' && saveSeasonName()}
                      autoFocus
                      style={{ flex: 1 }}
                      styles={{
                        input: { background: '#181825', border: '1px solid #313244', color: '#cdd6f4' },
                      }}
                    />
                  ) : (
                    <>
                      <Button
                        variant={selectedSeasonId === season.id ? 'filled' : 'subtle'}
                        color={selectedSeasonId === season.id ? 'blue' : 'gray'}
                        size="xs"
                        style={{ flex: 1 }}
                        justify="flex-start"
                        onClick={() => {
                          setSelectedSeasonId(season.id);
                          setSelectedEpisodeId(null);
                        }}
                        onDoubleClick={() => startEditingSeason(season)}
                      >
                        {season.name}
                      </Button>
                      {selectedSeasonId === season.id && (
                        <ActionIcon
                          size="xs"
                          variant="subtle"
                          color="red"
                          onClick={() => handleDeleteSeason(season.id)}
                        >
                          ×
                        </ActionIcon>
                      )}
                    </>
                  )}
                </Group>
              ))}
              {seasons.length === 0 && (
                <Text size="xs" c="dimmed" ta="center" p="md">No seasons</Text>
              )}
            </Stack>
          </ScrollArea>
        </Stack>

        {/* Episodes Panel */}
        <Stack gap={0} style={{ flex: 1 }}>
          <Group justify="space-between" p="xs" style={{ borderBottom: '1px solid #313244' }}>
            <Text size="xs" c="dimmed" fw={600}>EPISODES</Text>
            {selectedSeasonId && (
              <ActionIcon size="xs" variant="subtle" onClick={handleAddEpisode}>+</ActionIcon>
            )}
          </Group>
          <ScrollArea style={{ flex: 1 }}>
            <Stack gap={2} p="xs">
              {seasonEpisodes.map((episode) => (
                <Group key={episode.id} gap={4}>
                  <Button
                    variant={selectedEpisodeId === episode.id ? 'filled' : 'subtle'}
                    color={selectedEpisodeId === episode.id ? 'blue' : 'gray'}
                    size="xs"
                    style={{ flex: 1 }}
                    justify="flex-start"
                    onClick={() => setSelectedEpisodeId(episode.id)}
                    onDoubleClick={handleOpenEpisode}
                  >
                    E{episode.order}: {episode.name}
                  </Button>
                  {selectedEpisodeId === episode.id && (
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      color="red"
                      onClick={() => handleDeleteEpisode(episode.id)}
                    >
                      ×
                    </ActionIcon>
                  )}
                </Group>
              ))}
              {selectedSeasonId && seasonEpisodes.length === 0 && (
                <Text size="xs" c="dimmed" ta="center" p="md">No episodes</Text>
              )}
              {!selectedSeasonId && (
                <Text size="xs" c="dimmed" ta="center" p="md">Select a season</Text>
              )}
            </Stack>
          </ScrollArea>
        </Stack>
      </Group>

      {/* Footer */}
      <Group justify="flex-end" p="md" style={{ borderTop: '1px solid #313244' }}>
        <Button variant="subtle" color="gray" onClick={onClose}>
          Cancel
        </Button>
        <Button
          color="green"
          disabled={!selectedEpisodeId}
          onClick={handleOpenEpisode}
        >
          Open Episode
        </Button>
      </Group>
    </Modal>
  );
}
