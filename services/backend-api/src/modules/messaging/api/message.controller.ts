import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { getCurrentTenantId } from '../../../platform/tenant-context';
import { MessageService } from '../application/message.service';
import { ListMessagesQueryDto, ReplyMessageDto, MessageResponseDto, toMessageDto } from './message.dto';

@ApiTags('messages')
@Controller('messages')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Get()
  @ApiOperation({ summary: "List the tenant's customer messages (flat list, newest first), optionally only unanswered ones" })
  async list(@Query() dto: ListMessagesQueryDto): Promise<MessageResponseDto[]> {
    const list = await this.messageService.listMessages(getCurrentTenantId(), {
      ...(dto.unanswered === 'true' ? { unansweredOnly: true } : {}),
    });
    return list.map(toMessageDto);
  }

  @Get('unanswered-count')
  @ApiOperation({ summary: 'Count of messages with no reply yet — the inbox badge' })
  async unansweredCount(): Promise<{ count: number }> {
    return { count: await this.messageService.getUnansweredCount(getCurrentTenantId()) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'One customer message by id' })
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<MessageResponseDto> {
    return toMessageDto(await this.messageService.getMessage(id, getCurrentTenantId()));
  }

  @Post(':id/reply')
  @ApiOperation({ summary: "Record the household's reply to a customer message — stored and marked answered, not sent (no real Zalo outbound API yet)" })
  async reply(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReplyMessageDto): Promise<MessageResponseDto> {
    return toMessageDto(await this.messageService.reply(id, getCurrentTenantId(), dto.content));
  }
}
