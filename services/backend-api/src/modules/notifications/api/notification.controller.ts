import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { getCurrentTenantId } from '../../../platform/tenant-context';
import { CurrentUser } from '../../../platform/auth/current-user.decorator';
import type { JwtPayload } from '@qnsc-vn/identity';
import { NotificationService } from '../application/notification.service';
import { NotificationResponseDto, UnreadCountResponseDto } from './notification.dto';
import type { Notification } from '../domain/notification.types';

function toDto(n: Notification): NotificationResponseDto {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    isRead: n.isRead,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  };
}

/**
 * No SSE, no per-type preferences — a plain unread-count + list fetched on
 * demand is the right MVP shape for this audience (see CLAUDE.md's
 * "Notifications" section for the rally/opshub research this scope cut is
 * based on).
 */
@ApiTags('notifications')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: "List the authenticated user's notifications, newest first" })
  async list(@CurrentUser() user: JwtPayload): Promise<NotificationResponseDto[]> {
    const rows = await this.notificationService.list(getCurrentTenantId(), user.sub);
    return rows.map(toDto);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Unread notification count for the authenticated user' })
  async unreadCount(@CurrentUser() user: JwtPayload): Promise<UnreadCountResponseDto> {
    const count = await this.notificationService.unreadCount(getCurrentTenantId(), user.sub);
    return { count };
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark one notification read' })
  async markRead(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    await this.notificationService.markRead(getCurrentTenantId(), user.sub, id);
    return { message: 'Marked read.' };
  }

  @Post('read-all')
  @ApiOperation({ summary: "Mark all of the authenticated user's notifications read" })
  async markAllRead(@CurrentUser() user: JwtPayload): Promise<{ message: string }> {
    await this.notificationService.markAllRead(getCurrentTenantId(), user.sub);
    return { message: 'All marked read.' };
  }
}
